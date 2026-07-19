import logging
from typing import TypedDict

import numpy as np

logger = logging.getLogger("analyze")


class KeyResult(TypedDict):
    tonic: str
    mode: str
    confidence: float


class TempoResult(TypedDict):
    bpm: float
    confidence: float


class TimeSigResult(TypedDict):
    numerator: int
    denominator: int
    confidence: float


class ChordResult(TypedDict):
    root: str
    quality: str
    start: float
    end: float


class AnalysisResult(TypedDict):
    key: KeyResult
    tempo: TempoResult
    time_signature: TimeSigResult
    chords: list[ChordResult]


_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Krumhansl-Schmuckler key profiles (Kessler et al., 2001). Correlation of a
# pitch-class distribution against these gives musically meaningful major/minor
# key estimates, including relative-major/minor ambiguity — far more robust than
# the binary [1,0,1,...] templates used previously.
_KS_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_KS_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

# Chord vocabulary as pitch-class intervals from the root. Binary masks are
# matched against the active pitch-class set per frame; root + third are weighted
# so inversions / omitted fifths still resolve to the right quality.
_CHORD_INTERVALS: dict[str, list[int]] = {
    "M": [0, 4, 7],
    "m": [0, 3, 7],
    "dim": [0, 3, 6],
    "aug": [0, 4, 8],
    "7": [0, 4, 7, 10],
    "maj7": [0, 4, 7, 11],
    "min7": [0, 3, 7, 10],
    "m7b5": [0, 3, 6, 10],
    "sus4": [0, 5, 7],
    "6": [0, 4, 7, 9],
    "m6": [0, 3, 7, 9],
    "9": [0, 4, 7, 10, 2],
}


def _build_chord_templates() -> dict[str, np.ndarray]:
    templates: dict[str, np.ndarray] = {}
    for root in range(12):
        for quality, intervals in _CHORD_INTERVALS.items():
            mask = np.zeros(12, dtype=np.float64)
            for iv in intervals:
                mask[(root + iv) % 12] = 1.0
            # Weight the root and third (when present) so the quality is decided
            # by the harmonic skeleton, not by passing tones.
            mask[root % 12] = 1.5
            third = (root + (3 if quality.startswith(("m", "dim", "m7", "m6")) else 4)) % 12
            mask[third] = 1.3
            templates[f"{_NOTES[root]}:{quality}"] = mask
    return templates


_CHORD_TEMPLATES = _build_chord_templates()


def _load_audio(file_path: str) -> tuple[np.ndarray, int]:
    import librosa

    return librosa.load(file_path, sr=None, mono=True)


def _key_from_pc_vector(pc: np.ndarray) -> KeyResult:
    """Estimate key from a 12-dim pitch-class distribution using Krumhansl-
    Schmuckler profile correlation. Robust for both audio-chroma and symbolic
    (MIDI note) histograms."""
    if pc.sum() <= 0:
        return KeyResult(tonic="C", mode="major", confidence=0.0)

    pc = pc / pc.max() if pc.max() > 0 else pc
    best_corr = -1.0
    best_tonic = "C"
    best_mode = "major"

    for shift in range(12):
        rolled = np.roll(pc, shift)
        corr_major = float(np.dot(rolled, _KS_MAJOR))
        corr_minor = float(np.dot(rolled, _KS_MINOR))
        if corr_major > best_corr:
            best_corr = corr_major
            best_tonic = _NOTES[shift]
            best_mode = "major"
        if corr_minor > best_corr:
            best_corr = corr_minor
            best_tonic = _NOTES[shift]
            best_mode = "minor"

    max_possible = float(np.dot(_KS_MAJOR, _KS_MAJOR))
    confidence = best_corr / max_possible if max_possible > 0 else 0.0
    confidence = round(min(max(confidence, 0.0), 1.0), 3)

    return KeyResult(tonic=best_tonic, mode=best_mode, confidence=confidence)


def detect_key(y: np.ndarray, sr: int) -> KeyResult:
    import librosa

    hop_length = 512
    chroma = librosa.feature.chroma_cens(y=y, sr=sr, hop_length=hop_length)
    chroma_mean = chroma.mean(axis=1)
    return _key_from_pc_vector(chroma_mean)


def detect_tempo(y: np.ndarray, sr: int) -> TempoResult:
    import librosa

    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    bpm_array = librosa.beat.tempo(onset_envelope=onset_env, sr=sr, aggregate=None)
    bpm = float(np.median(bpm_array)) if len(bpm_array) > 0 else 120.0
    onset_std = float(np.std(onset_env))
    onset_mean = float(np.mean(onset_env))
    confidence = min(onset_std / (onset_mean + 1e-8) / 3.0, 1.0) if onset_mean > 0 else 0.0
    confidence = round(max(confidence, 0.0), 3)

    return TempoResult(bpm=round(bpm, 1), confidence=confidence)


def detect_time_signature(y: np.ndarray, sr: int) -> TimeSigResult:
    import librosa

    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    ac = np.correlate(onset_env, onset_env, mode="full")
    ac = ac[len(ac) // 2 :]
    if len(ac) < 8:
        return TimeSigResult(numerator=4, denominator=4, confidence=0.1)

    peaks = []
    for i in range(2, min(len(ac) - 1, 128)):
        if ac[i] > ac[i - 1] and ac[i] > ac[i + 1] and ac[i] > 0.3 * ac.max():
            peaks.append(i)

    if len(peaks) < 2:
        return TimeSigResult(numerator=4, denominator=4, confidence=0.3)

    intervals = np.diff(peaks)
    beat_period = float(np.median(intervals)) if len(intervals) > 0 else 4.0
    beats_per_measure = round(4.0 / beat_period * 4) if beat_period > 0 else 4
    beats_per_measure = max(2, min(beats_per_measure, 12))

    confidence = min(float(len(peaks)) / 20.0, 0.8)
    return TimeSigResult(
        numerator=beats_per_measure,
        denominator=4,
        confidence=round(confidence, 3),
    )


def _chords_from_frames(frames: list[tuple[float, np.ndarray]]) -> list[ChordResult]:
    """Label a sequence of (time, 12-dim pitch-class vector) frames with the
    nearest chord template. Shared by the audio and symbolic (MIDI) paths."""
    if not frames:
        return []

    chords: list[ChordResult] = []
    current_label = ""
    current_start = 0.0
    current_root = ""
    current_quality = ""
    templates = list(_CHORD_TEMPLATES.items())

    for t, vec in frames:
        frame = vec / vec.max() if vec.max() > 0 else vec

        if frame.sum() < 0.1:
            if current_label:
                chords.append(
                    ChordResult(
                        root=current_root,
                        quality=current_quality,
                        start=round(current_start, 3),
                        end=round(t, 3),
                    )
                )
                current_label = ""
            continue

        best_score = -1.0
        best_label = "C:M"
        for label, tmpl in templates:
            score = float(np.dot(frame, tmpl))
            if score > best_score:
                best_score = score
                best_label = label

        root, quality = best_label.split(":")

        if best_label != current_label:
            if current_label and t - current_start > 0.1:
                chords.append(
                    ChordResult(
                        root=current_root,
                        quality=current_quality,
                        start=round(current_start, 3),
                        end=round(t, 3),
                    )
                )
            current_label = best_label
            current_start = t
            current_root = root
            current_quality = quality

    if current_label:
        total_duration = frames[-1][0]
        chords.append(
            ChordResult(
                root=current_root,
                quality=current_quality,
                start=round(current_start, 3),
                end=round(total_duration, 3),
            )
        )

    return chords


def detect_chords(y: np.ndarray, sr: int) -> list[ChordResult]:
    import librosa

    hop_length = 512
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_length, n_chroma=12)
    n_frames = chroma.shape[1]
    if n_frames == 0:
        return []

    hop_duration = hop_length / sr
    frames = [(i * hop_duration, chroma[:, i]) for i in range(n_frames)]
    return _chords_from_frames(frames)


def _midi_frames(midi_path: str) -> tuple[np.ndarray, list[tuple[float, np.ndarray]]]:
    """Return (pitch-class histogram, per-window chord frames) from a MIDI file.

    The histogram weights each pitch class by the total sounding duration of its
    notes; chord frames bucket notes into 0.25s windows and sum their pitch
    classes. This is the symbolic input to key/chord detection — more accurate
    than re-deriving harmony from the audio signal."""
    import pretty_midi

    pm = pretty_midi.PrettyMIDI(midi_path)
    pc_hist = np.zeros(12, dtype=np.float64)
    windows: dict[int, np.ndarray] = {}
    for instr in pm.instruments:
        if instr.is_drum:
            continue
        for note in instr.notes:
            pclass = note.pitch % 12
            dur = max(note.end - note.start, 0.0)
            pc_hist[pclass] += dur
            wid = int(note.start / 0.25)
            if wid not in windows:
                windows[wid] = np.zeros(12, dtype=np.float64)
            windows[wid][pclass] += dur

    frames = [
        (wid * 0.25, vec) for wid, vec in sorted(windows.items()) if vec.sum() > 0
    ]
    return pc_hist, frames


def _midi_tempo(pm) -> float | None:
    try:
        times, tempos = pm.get_tempo_changes()
    except Exception:
        return None
    if len(tempos) == 0:
        return None
    return float(np.median(tempos))


def analyze_from_midi(midi_path: str) -> dict[str, object]:
    """Symbolic analysis from a MIDI file. Returns key + chords derived from the
    note events, plus tempo/time_signature when the MIDI carries that metadata."""
    import pretty_midi

    pm = pretty_midi.PrettyMIDI(midi_path)
    pc_hist, frames = _midi_frames(midi_path)
    result: dict[str, object] = {
        "key": _key_from_pc_vector(pc_hist),
        "chords": _chords_from_frames(frames),
    }

    tempo = _midi_tempo(pm)
    if tempo:
        result["tempo"] = TempoResult(bpm=round(tempo, 1), confidence=0.9)

    try:
        ts_times, ts_nums, ts_denoms = pm.get_time_signatures()
        if len(ts_nums) > 0:
            result["time_signature"] = TimeSigResult(
                numerator=int(ts_nums[0]), denominator=int(ts_denoms[0]), confidence=0.9
            )
    except Exception:
        pass

    return result


def analyze_audio(file_path: str, midi_path: str | None = None) -> AnalysisResult:
    y, sr = _load_audio(file_path)
    result = AnalysisResult(
        key=detect_key(y, sr),
        tempo=detect_tempo(y, sr),
        time_signature=detect_time_signature(y, sr),
        chords=detect_chords(y, sr),
    )

    if midi_path:
        try:
            symbolic = analyze_from_midi(midi_path)
            result["key"] = symbolic["key"]  # type: ignore[index]
            result["chords"] = symbolic["chords"]  # type: ignore[index]
            if "tempo" in symbolic:
                result["tempo"] = symbolic["tempo"]  # type: ignore[index]
            if "time_signature" in symbolic:
                result["time_signature"] = symbolic["time_signature"]  # type: ignore[index]
        except Exception:
            logger.exception("symbolic analysis failed; falling back to audio")

    return result
