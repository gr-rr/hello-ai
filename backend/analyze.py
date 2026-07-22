"""MIDI-only harmonic analysis pipeline.

All analysis runs on symbolic data (MIDI).  Audio files are *never*
analysed directly — the transcribe endpoint converts audio → MIDI first,
then this module analyses the MIDI.

Pipeline:
    MIDI  →  pretty_midi  (tempo, time-sig, note events)
          →  music21      (Roman numerals, cadences, modulations, voice leading)
          →  partitura    (key estimation, tonal tension)
          →  chord smoothing  (remove impossible transitions, merge short chords)
"""

import logging
from collections import Counter
from typing import TypedDict

import numpy as np

logger = logging.getLogger("analyze")


# ── TypedDicts ──────────────────────────────────────────────────────────────

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


class RomanNumeralResult(TypedDict):
    figure: str
    root: str
    quality: str
    start: float
    end: float


class CadenceResult(TypedDict):
    type: str
    chords: list[str]
    position: float


class ModulationResult(TypedDict):
    from_key: str
    to_key: str
    position: float


class VoiceLeadingResult(TypedDict):
    parallel: float
    contrary: float
    oblique: float
    similar: float
    motion_summary: str


class PhraseResult(TypedDict):
    start: float
    end: float
    kind: str


class TonalTensionResult(TypedDict):
    tension: list[float]
    peaks: list[float]


class AnalysisResult(TypedDict):
    key: KeyResult
    tempo: TempoResult
    time_signature: TimeSigResult
    chords: list[ChordResult]
    roman_numerals: list[RomanNumeralResult]
    cadences: list[CadenceResult]
    modulations: list[ModulationResult]
    voice_leading: VoiceLeadingResult | None
    phrases: list[PhraseResult]
    tonal_tension: TonalTensionResult | None


# ── Constants ───────────────────────────────────────────────────────────────

_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Krumhansl-Schmuckler key profiles (Kessler et al., 2001).
_KS_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_KS_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

# Analysis thresholds
_MIN_CHORD_FRAME_SUM = 0.1
_MIN_CHORD_DURATION = 0.3          # merge chords shorter than this
_MIDI_FRAME_WINDOW = 0.25
_MAX_ROMAN_NUMERALS = 500
_MAX_VOICE_LEADING_PAIRS = 2000
_MIN_MODULATION_NOTES_MULTIPLIER = 4
_MIN_PITCHES_PER_WINDOW = 4
_CHORD_SMOOTHING_WINDOW = 3        # majority-vote window for chord smoothing

# Chord vocabulary as pitch-class intervals from the root.
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

# Quality labels from music21 impliedQuality → our short label
_QUALITY_MAP = {
    "major": "M",
    "minor": "m",
    "diminished": "dim",
    "augmented": "aug",
    "dominant seventh": "7",
    "major seventh": "maj7",
    "minor seventh": "min7",
    "half-diminished": "m7b5",
    "diminished seventh": "dim7",
    "suspended fourth": "sus4",
    "major sixth": "6",
    "minor sixth": "m6",
    "dominant ninth": "9",
}

# Allowed root transitions (Circle-of-fifths + common progressions).
# Used to filter out noisy chord detections.
_ALLOWED_ROOT_TRANSITIONS: set[tuple[int, int]] = set()
for _i in range(12):
    # Perfect fifth / fourth
    _ALLOWED_ROOT_TRANSITIONS.add((_i, (_i + 7) % 12))
    _ALLOWED_ROOT_TRANSITIONS.add((_i, (_i + 5) % 12))
    # Stepwise
    _ALLOWED_ROOT_TRANSITIONS.add((_i, (_i + 1) % 12))
    _ALLOWED_ROOT_TRANSITIONS.add((_i, (_i + 11) % 12))
    # Thirds
    _ALLOWED_ROOT_TRANSITIONS.add((_i, (_i + 3) % 12))
    _ALLOWED_ROOT_TRANSITIONS.add((_i, (_i + 4) % 12))
    _ALLOWED_ROOT_TRANSITIONS.add((_i, (_i + 9) % 12))
    _ALLOWED_ROOT_TRANSITIONS.add((_i, (_i + 8) % 12))
    # Tritone (dominant function)
    _ALLOWED_ROOT_TRANSITIONS.add((_i, (_i + 6) % 12))


def _build_chord_templates() -> dict[str, np.ndarray]:
    templates: dict[str, np.ndarray] = {}
    for root in range(12):
        for quality, intervals in _CHORD_INTERVALS.items():
            mask = np.zeros(12, dtype=np.float64)
            for iv in intervals:
                mask[(root + iv) % 12] = 1.0
            mask[root % 12] = 1.5
            third = (root + (3 if quality.startswith(("m", "dim", "m7", "m6")) else 4)) % 12
            mask[third] = 1.3
            templates[f"{_NOTES[root]}:{quality}"] = mask
    return templates


_CHORD_TEMPLATES = _build_chord_templates()


# ── Key estimation ──────────────────────────────────────────────────────────

def _key_from_pc_vector(pc: np.ndarray) -> KeyResult:
    """Estimate key from a 12-dim pitch-class distribution using Krumhansl-
    Schmuckler profile correlation."""
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


def _estimate_key_partitura(midi_path: str) -> KeyResult | None:
    """Use partitura for key estimation (Krumhansl method on note array)."""
    try:
        import partitura as pt
        score = pt.load_score(midi_path)
        note_array = pt.musicanalysis.compute_note_array(
            score, include_key_signature=True, include_time_signature=True
        )
        key_str = pt.musicanalysis.estimate_key(note_array, method="krumhansl")
        # key_str is like "A minor" or "C# major"
        parts = key_str.strip().split()
        if len(parts) >= 2:
            tonic = parts[0]
            mode = parts[1].lower()
            return KeyResult(tonic=tonic, mode=mode, confidence=0.85)
    except Exception:
        logger.debug("partitura key estimation failed, falling back to PC histogram")
    return None


# ── Chord detection from MIDI ───────────────────────────────────────────────

def _midi_frames(midi_path: str) -> tuple[np.ndarray, list[tuple[float, np.ndarray]]]:
    """Return (pitch-class histogram, per-window chord frames) from a MIDI file."""
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
            wid = int(note.start / _MIDI_FRAME_WINDOW)
            if wid not in windows:
                windows[wid] = np.zeros(12, dtype=np.float64)
            windows[wid][pclass] += dur

    sorted_w = sorted(windows.items())
    frames = [(w * _MIDI_FRAME_WINDOW, v) for w, v in sorted_w if v.sum() > 0]
    return pc_hist, frames


def _chords_from_frames(frames: list[tuple[float, np.ndarray]]) -> list[ChordResult]:
    """Label a sequence of (time, 12-dim pitch-class vector) frames with the
    nearest chord template."""
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

        if frame.sum() < _MIN_CHORD_FRAME_SUM:
            if current_label:
                chords.append(ChordResult(
                    root=current_root, quality=current_quality,
                    start=round(current_start, 3), end=round(t, 3),
                ))
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
            if current_label and t - current_start > _MIN_CHORD_DURATION:
                chords.append(ChordResult(
                    root=current_root, quality=current_quality,
                    start=round(current_start, 3), end=round(t, 3),
                ))
            current_label = best_label
            current_start = t
            current_root = root
            current_quality = quality

    if current_label:
        total_duration = frames[-1][0]
        chords.append(ChordResult(
            root=current_root, quality=current_quality,
            start=round(current_start, 3), end=round(total_duration, 3),
        ))

    return chords


def _smooth_chords(chords: list[ChordResult]) -> list[ChordResult]:
    """Post-process chord sequence:
    1. Remove impossible root transitions (keep only circle-of-fifths, stepwise, thirds).
    2. Merge neighbouring chords of the same quality.
    3. Remove very short chords (< _MIN_CHORD_DURATION).
    """
    if len(chords) <= 1:
        return chords

    # Step 1: filter impossible transitions
    filtered = [chords[0]]
    for ch in chords[1:]:
        prev_root_idx = _NOTES.index(filtered[-1]["root"]) if filtered[-1]["root"] in _NOTES else -1
        curr_root_idx = _NOTES.index(ch["root"]) if ch["root"] in _NOTES else -1
        if prev_root_idx >= 0 and curr_root_idx >= 0:
            if (prev_root_idx, curr_root_idx) in _ALLOWED_ROOT_TRANSITIONS:
                filtered.append(ch)
            else:
                # Extend previous chord instead
                filtered[-1]["end"] = ch["end"]
        else:
            filtered.append(ch)

    # Step 2: merge same-quality neighbours
    merged = [filtered[0]]
    for ch in filtered[1:]:
        if ch["root"] == merged[-1]["root"] and ch["quality"] == merged[-1]["quality"]:
            merged[-1]["end"] = ch["end"]
        else:
            merged.append(ch)

    # Step 3: remove very short chords
    result = [ch for ch in merged if ch["end"] - ch["start"] >= _MIN_CHORD_DURATION]
    return result if result else merged[:1]


# ── MIDI tempo / time signature ────────────────────────────────────────────

def _midi_tempo(pm) -> float | None:
    try:
        _, tempos = pm.get_tempo_changes()
    except Exception:
        return None
    if len(tempos) == 0:
        return None
    return float(np.median(tempos))


# ── music21 deep analysis ──────────────────────────────────────────────────

def _m21_roman_numerals(score, detected_key) -> list[RomanNumeralResult]:
    """Roman numeral analysis from a pre-parsed music21 Score."""
    try:
        from music21 import roman
    except ImportError:
        return []

    results: list[RomanNumeralResult] = []

    for part in score.parts:
        for measure in part.getElementsByClass("Measure"):
            chords_in_measure = measure.getElementsByClass("Chord")
            if not chords_in_measure:
                continue
            for ch in chords_in_measure:
                try:
                    rn = roman.romanNumeralFromChord(ch, detected_key)
                    figure = rn.figure
                    root_p = ch.root()
                    root_name = root_p.name if root_p else "?"
                    implied = str(rn.impliedQuality) if hasattr(rn, "impliedQuality") else "unknown"
                    quality = _QUALITY_MAP.get(implied, implied)
                    start = float(ch.offset) if ch.offset is not None else 0.0
                    dur = float(ch.quarterLength) if hasattr(ch, "quarterLength") else 0.0
                    results.append(RomanNumeralResult(
                        figure=figure, root=root_name, quality=quality,
                        start=round(start, 3), end=round(start + dur, 3),
                    ))
                except Exception:
                    continue
            if len(results) > _MAX_ROMAN_NUMERALS:
                break
        if len(results) > _MAX_ROMAN_NUMERALS:
            break

    return results


def _m21_cadences(score, detected_key) -> list[CadenceResult]:
    """Detect cadences from chord progressions."""
    try:
        from music21 import roman
    except ImportError:
        return []

    cadences: list[CadenceResult] = []

    _CADENCE_PATTERNS: list[tuple[str, list[str]]] = [
        ("authentic", ["V", "I"]),
        ("plagal", ["IV", "I"]),
        ("half", ["I", "V"]),
        ("deceptive", ["V", "vi"]),
        ("authentic", ["V7", "I"]),
        ("authentic", ["V", "i"]),
        ("half", ["i", "V"]),
        ("deceptive", ["V", "VI"]),
    ]

    chord_seq: list[tuple[float, str]] = []
    for part in score.parts:
        for measure in part.getElementsByClass("Measure"):
            for ch in measure.getElementsByClass("Chord"):
                try:
                    rn = roman.romanNumeralFromChord(ch, detected_key)
                    offset = float(ch.offset) if ch.offset is not None else 0.0
                    chord_seq.append((offset, rn.figure))
                except Exception:
                    continue

    for i in range(len(chord_seq) - 1):
        pair = [chord_seq[i][1], chord_seq[i + 1][1]]
        for cad_type, pattern in _CADENCE_PATTERNS:
            if pair == pattern:
                cadences.append(CadenceResult(
                    type=cad_type, chords=pair,
                    position=round(chord_seq[i][0], 3),
                ))
                break

    return cadences


def _m21_modulations(score, window_size: int = 8) -> list[ModulationResult]:
    """Detect key modulations via windowed key analysis."""
    all_notes = []
    for part in score.parts:
        for note in part.recurse().getElementsByClass("GeneralNote"):
            offset = float(note.offset) if note.offset is not None else 0.0
            if hasattr(note, "pitch") and note.pitch is not None:
                all_notes.append((offset, note.pitch.midi))

    if len(all_notes) < window_size * _MIN_MODULATION_NOTES_MULTIPLIER:
        return []

    all_notes.sort(key=lambda x: x[0])
    max_offset = all_notes[-1][0] if all_notes else 1.0

    window_sec = max_offset / max(window_size, 1)
    key_history: list[tuple[float, str]] = []

    for w in range(window_size):
        t_start = w * window_sec
        t_end = (w + 1) * window_sec
        pitches_in_window = [p for t, p in all_notes if t_start <= t < t_end]
        if len(pitches_in_window) < _MIN_PITCHES_PER_WINDOW:
            continue

        pc_counts = Counter(p % 12 for p in pitches_in_window)
        pc_dist = np.zeros(12)
        for pc, cnt in pc_counts.items():
            pc_dist[pc] = cnt
        kr = _key_from_pc_vector(pc_dist)
        key_str = f"{kr['tonic']} {kr['mode']}"
        key_history.append((t_start, key_str))

    modulations: list[ModulationResult] = []
    for i in range(1, len(key_history)):
        prev_key = key_history[i - 1][1]
        curr_key = key_history[i][1]
        if prev_key != curr_key:
            modulations.append(ModulationResult(
                from_key=prev_key, to_key=curr_key,
                position=round(key_history[i][0], 3),
            ))

    return modulations


def _m21_voice_leading(score) -> VoiceLeadingResult | None:
    """Analyze voice leading between parts."""
    try:
        from music21 import voiceLeading
    except ImportError:
        return None

    parts = list(score.parts)
    if len(parts) < 2:
        return None

    parallel = 0
    contrary = 0
    oblique = 0
    similar = 0
    total = 0

    for i in range(min(len(parts), 4)):
        for j in range(i + 1, min(len(parts), 4)):
            try:
                vlqs = voiceLeading.iterateAllVoiceLeadingQuartets(parts[i], parts[j])
                for vlq in vlqs:
                    motion = vlq.motionType()
                    if "Parallel" in str(motion):
                        parallel += 1
                    elif "Contrary" in str(motion):
                        contrary += 1
                    elif "Oblique" in str(motion):
                        oblique += 1
                    elif "Similar" in str(motion):
                        similar += 1
                    total += 1
                    if total > _MAX_VOICE_LEADING_PAIRS:
                        break
            except Exception:
                continue
            if total > _MAX_VOICE_LEADING_PAIRS:
                break
        if total > _MAX_VOICE_LEADING_PAIRS:
            break

    if total == 0:
        return None

    def _ratio(n: int) -> float:
        return round(n / total, 3) if total > 0 else 0.0

    p_pct = _ratio(parallel)
    c_pct = _ratio(contrary)
    o_pct = _ratio(oblique)
    s_pct = _ratio(similar)
    dominant = max(
        ("parallel", p_pct), ("contrary", c_pct),
        ("oblique", o_pct), ("similar", s_pct),
        key=lambda x: x[1],
    )

    return VoiceLeadingResult(
        parallel=p_pct, contrary=c_pct, oblique=o_pct, similar=s_pct,
        motion_summary=f"{dominant[0]} motion dominates ({dominant[1] * 100:.0f}%)",
    )


def _m21_phrases(score) -> list[PhraseResult]:
    """Detect phrases from slur markings and measure groupings."""
    phrases: list[PhraseResult] = []
    for part in score.parts:
        slurs = part.getElementsByClass("Slur")
        for slur in slurs:
            try:
                start_note = slur.getFirst()
                end_note = slur.getLast()
                if start_note and end_note:
                    start = float(start_note.offset) if start_note.offset is not None else 0.0
                    end = float(end_note.offset) if end_note.offset is not None else 0.0
                    if hasattr(end_note, "quarterLength"):
                        end += float(end_note.quarterLength)
                    if end > start:
                        phrases.append(PhraseResult(
                            start=round(start, 3), end=round(end, 3), kind="slur",
                        ))
            except Exception:
                continue

    # If no slurs, infer phrases from measure groupings (4-bar phrases)
    if not phrases:
        for part in score.parts:
            measures = part.getElementsByClass("Measure")
            if len(measures) >= 4:
                for i in range(0, len(measures), 4):
                    group = measures[i:i + 4]
                    if len(group) >= 2:
                        start = float(group[0].offset) if group[0].offset is not None else 0.0
                        last = group[-1]
                        end = float(last.offset) if last.offset is not None else 0.0
                        if hasattr(last, "quarterLength"):
                            end += float(last.quarterLength)
                        if end > start:
                            phrases.append(PhraseResult(
                                start=round(start, 3), end=round(end, 3), kind="measure_group",
                            ))
                break  # only use first part for measure-based phrases

    return phrases


# ── Partitura tonal tension ────────────────────────────────────────────────

def _partitura_tension(midi_path: str) -> TonalTensionResult | None:
    """Compute tonal tension curve using partitura."""
    try:
        import partitura as pt
        score = pt.load_score(midi_path)
        note_array = pt.musicanalysis.compute_note_array(
            score, include_key_signature=True
        )
        tension_data = pt.musicanalysis.estimate_tonaltension(note_array)
        if tension_data is not None and len(tension_data) > 0:
            tension_list = [float(x) for x in tension_data.flatten()[:200]]
            # Find peaks (local maxima)
            peaks = []
            for i in range(1, len(tension_list) - 1):
                if tension_list[i] > tension_list[i - 1] and tension_list[i] > tension_list[i + 1]:
                    peaks.append(round(tension_list[i], 3))
            return TonalTensionResult(tension=tension_list, peaks=peaks[:20])
    except Exception:
        logger.debug("partitura tonal tension failed")
    return None


# ── Main entry point ────────────────────────────────────────────────────────

def deep_midi_analysis(midi_path: str) -> dict[str, object]:
    """Run music21-based deep analysis on a MIDI file.

    Parses the score once and passes it to all sub-analyses.
    """
    try:
        from music21 import converter
    except ImportError:
        return {}

    try:
        score = converter.parse(midi_path, quantizePost=False)
    except Exception:
        return {}

    result: dict[str, object] = {}

    detected_key = score.analyze("key")

    roman_numerals = _m21_roman_numerals(score, detected_key)
    if roman_numerals:
        result["roman_numerals"] = roman_numerals

    cadences = _m21_cadences(score, detected_key)
    if cadences:
        result["cadences"] = cadences

    modulations = _m21_modulations(score)
    if modulations:
        result["modulations"] = modulations

    vl = _m21_voice_leading(score)
    if vl:
        result["voice_leading"] = vl

    phrases = _m21_phrases(score)
    if phrases:
        result["phrases"] = phrases

    return result


def analyze_midi(midi_path: str) -> AnalysisResult:
    """Full symbolic analysis of a MIDI file.

    Pipeline:
        1. pretty_midi → tempo, time signature, note events
        2. Pitch-class histogram → key (Krumhansl-Schmuckler)
        3. Windowed pitch classes → chord detection
        4. Chord smoothing → remove noise
        5. music21 → Roman numerals, cadences, modulations, voice leading, phrases
        6. partitura → tonal tension
    """
    import pretty_midi

    pm = pretty_midi.PrettyMIDI(midi_path)
    pc_hist, frames = _midi_frames(midi_path)

    # Key: prefer partitura (more accurate), fall back to PC histogram
    key = _estimate_key_partitura(midi_path) or _key_from_pc_vector(pc_hist)

    # Chords: detect + smooth
    raw_chords = _chords_from_frames(frames)
    chords = _smooth_chords(raw_chords)

    result: AnalysisResult = {
        "key": key,
        "chords": chords,
        "roman_numerals": [],
        "cadences": [],
        "modulations": [],
        "voice_leading": None,
        "phrases": [],
        "tonal_tension": None,
    }

    # Tempo from MIDI metadata
    tempo = _midi_tempo(pm)
    if tempo:
        result["tempo"] = TempoResult(bpm=round(tempo, 1), confidence=0.9)

    # Time signature from MIDI metadata
    try:
        _, ts_nums, ts_denoms = pm.get_time_signatures()
        if len(ts_nums) > 0:
            result["time_signature"] = TimeSigResult(
                numerator=int(ts_nums[0]), denominator=int(ts_denoms[0]), confidence=0.9
            )
    except Exception:
        pass

    # Deep music21 analysis
    try:
        deep = deep_midi_analysis(midi_path)
        result.update(deep)
    except Exception:
        logger.exception("deep midi analysis failed; skipping")

    # Partitura tonal tension
    try:
        tension = _partitura_tension(midi_path)
        if tension:
            result["tonal_tension"] = tension
    except Exception:
        logger.debug("tonal tension failed; skipping")

    return result
