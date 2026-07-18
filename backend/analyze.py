from typing import TypedDict

import numpy as np


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

_MAJOR_TEMPLATE = np.array([1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1], dtype=np.float64)
_MINOR_TEMPLATE = np.array([1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0], dtype=np.float64)

_CHORD_TEMPLATES: dict[str, np.ndarray] = {}
for i, root in enumerate(_NOTES):
    mask = np.zeros(12, dtype=np.float64)
    mask[[i, (i + 4) % 12, (i + 7) % 12]] = 1
    _CHORD_TEMPLATES[f"{root}:M"] = mask
    mask2 = np.zeros(12, dtype=np.float64)
    mask2[[i, (i + 3) % 12, (i + 7) % 12]] = 1
    _CHORD_TEMPLATES[f"{root}:m"] = mask2
    mask3 = np.zeros(12, dtype=np.float64)
    mask3[[i, (i + 3) % 12, (i + 6) % 12]] = 1
    _CHORD_TEMPLATES[f"{root}:dim"] = mask3
    mask4 = np.zeros(12, dtype=np.float64)
    mask4[[i, (i + 4) % 12, (i + 8) % 12]] = 1
    _CHORD_TEMPLATES[f"{root}:aug"] = mask4
    mask5 = np.zeros(12, dtype=np.float64)
    mask5[[i, (i + 4) % 12, (i + 7) % 12, (i + 10) % 12]] = 1
    _CHORD_TEMPLATES[f"{root}:7"] = mask5


def _load_audio(file_path: str) -> tuple[np.ndarray, int]:
    import librosa

    return librosa.load(file_path, sr=None, mono=True)


def detect_key(y: np.ndarray, sr: int) -> KeyResult:
    import librosa

    hop_length = 512
    chroma = librosa.feature.chroma_cens(y=y, sr=sr, hop_length=hop_length)
    chroma_mean = chroma.mean(axis=1)
    if chroma_mean.max() > 0:
        chroma_mean /= chroma_mean.max()

    best_corr = -1.0
    best_tonic = "C"
    best_mode = "major"

    for shift in range(12):
        rolled = np.roll(chroma_mean, shift)
        corr_major = float(np.dot(rolled, _MAJOR_TEMPLATE))
        corr_minor = float(np.dot(rolled, _MINOR_TEMPLATE))
        if corr_major > best_corr:
            best_corr = corr_major
            best_tonic = _NOTES[shift]
            best_mode = "major"
        if corr_minor > best_corr:
            best_corr = corr_minor
            best_tonic = _NOTES[shift]
            best_mode = "minor"

    max_possible = float(np.dot(np.ones(12), _MAJOR_TEMPLATE))
    confidence = best_corr / max_possible if max_possible > 0 else 0.0
    confidence = min(max(confidence, 0.0), 1.0)

    return KeyResult(tonic=best_tonic, mode=best_mode, confidence=round(confidence, 3))


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


def detect_chords(y: np.ndarray, sr: int) -> list[ChordResult]:
    import librosa

    hop_length = 512
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_length, n_chroma=12)
    n_frames = chroma.shape[1]
    if n_frames == 0:
        return []

    hop_duration = hop_length / sr
    chords: list[ChordResult] = []
    current_label = ""
    current_start = 0.0
    current_root = ""
    current_quality = ""

    templates = list(_CHORD_TEMPLATES.items())

    for i in range(n_frames):
        frame = chroma[:, i]
        if frame.max() > 0:
            frame = frame / frame.max()

        t = i * hop_duration

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

        t = i * hop_duration
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
        total_duration = n_frames * hop_duration
        chords.append(
            ChordResult(
                root=current_root,
                quality=current_quality,
                start=round(current_start, 3),
                end=round(total_duration, 3),
            )
        )

    return chords


def analyze_audio(file_path: str) -> AnalysisResult:
    y, sr = _load_audio(file_path)
    return AnalysisResult(
        key=detect_key(y, sr),
        tempo=detect_tempo(y, sr),
        time_signature=detect_time_signature(y, sr),
        chords=detect_chords(y, sr),
    )
