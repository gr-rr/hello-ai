"""Server-side music features: audio transcription + MIDI synthesis.

- transcribe_audio: arbitrary audio (wav/mp3/ogg/flac) -> MIDI (basic-pitch,
  Apache-2.0). Also returns a synthesized WAV rendering of that MIDI (so the
  user gets a corresponding audio<->text pair) and the raw note events.
- midi_to_wav: render a MIDI file to a WAV using FluidSynth + a bundled piano
  SoundFont for a natural instrument timbre. Falls back to a self-contained
  numpy piano synth if FluidSynth / the SoundFont is unavailable.

Runs on CPU (Oracle always-free ARM VM). Suitable for short clips (seconds to a
couple minutes).
"""
import io
import json
import logging
import os
import tempfile

import numpy as np
import soundfile as sf

logger = logging.getLogger("music_features")

# Location of the bundled GM SoundFont used for synthesis. A real-instrument
# SoundFont (FluidR3_GM) is downloaded at image build time (see Dockerfile).
SOUNDFONT_PATH = os.environ.get("SOUNDFONT_PATH", "/app/soundfonts/FluidR3_GM.sf2")


# ---------------------------------------------------------------------------
# MIDI -> WAV (FluidSynth + SoundFont, numpy fallback)
# ---------------------------------------------------------------------------
def _midi_to_wav_fluidsynth(midi_bytes: bytes, sr: int = 22050) -> bytes | None:
    """Render MIDI to WAV via FluidSynth using a bundled SoundFont.

    Returns None if FluidSynth or the SoundFont is unavailable so the caller can
    fall back to the numpy synth.
    """
    if not os.path.exists(SOUNDFONT_PATH):
        return None
    try:
        import fluidsynth  # pyfluidsynth
    except Exception as e:
        logger.warning(f"fluidsynth unavailable, falling back to numpy synth: {e}")
        return None

    with tempfile.TemporaryDirectory() as td:
        midi_path = os.path.join(td, "input.mid")
        wav_path = os.path.join(td, "input.wav")
        with open(midi_path, "wb") as f:
            f.write(midi_bytes)
        fs = fluidsynth.Synth(samplerate=float(sr))
        try:
            sfid = fs.sfload(SOUNDFONT_PATH)
            fs.program_select(0, sfid, 0, 0)  # bank 0, piano (prog 0)
            fs.midi2audio(midi_path, wav_path)
        finally:
            fs.delete()
        if not os.path.exists(wav_path):
            return None
        with open(wav_path, "rb") as f:
            return f.read()


def _note_to_freq(midi_note: int) -> float:
    return 440.0 * (2.0 ** ((midi_note - 69) / 12.0))


def _midi_to_wav_numpy(midi_bytes: bytes, sr: int = 22050) -> bytes:
    """Self-contained polyphonic piano synth (additive sines + ADSR)."""
    import pretty_midi

    midi = pretty_midi.PrettyMIDI(io.BytesIO(midi_bytes))
    duration = max(midi.get_end_time(), 0.1)
    n = int((duration + 0.5) * sr)
    out = np.zeros(n, dtype=np.float64)

    for instrument in midi.instruments:
        for note in instrument.notes:
            f = _note_to_freq(note.pitch)
            start = int(note.start * sr)
            end = int(note.end * sr)
            if end <= start:
                end = start + int(0.2 * sr)
            seg = np.arange(end - start) / sr
            env = np.ones_like(seg)
            attack = int(0.01 * sr)
            release = int(0.15 * sr)
            if len(env) > attack:
                env[:attack] = np.linspace(0, 1, attack)
            if len(env) > release:
                env[-release:] = np.linspace(1, 0, release)
            sig = np.zeros_like(seg)
            for mult, amp in [(1, 1.0), (2, 0.3), (3, 0.12), (4, 0.06)]:
                sig += amp * np.sin(2 * np.pi * f * mult * seg)
            sig *= env * 0.22
            out[start:end] += sig

    out = np.clip(out, -1.0, 1.0)
    pcm = (out * 32767.0).astype(np.int16)
    buf = io.BytesIO()
    sf.write(buf, pcm, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def midi_to_wav(midi_bytes: bytes, sr: int = 22050) -> bytes:
    """Render MIDI bytes to a 16-bit PCM WAV. Prefers FluidSynth (natural
    timbre) and falls back to the numpy synth if unavailable."""
    wav = _midi_to_wav_fluidsynth(midi_bytes, sr)
    if wav is not None:
        return wav
    return _midi_to_wav_numpy(midi_bytes, sr)


# ---------------------------------------------------------------------------
# Audio -> MIDI (basic-pitch)
# ---------------------------------------------------------------------------
def transcribe_audio(audio_bytes: bytes, fmt: str = "wav", onset_threshold: float = 0.5, frame_threshold: float = 0.3) -> dict:
    """Transcribe audio to MIDI. Returns a dict with midi (bytes), wav (bytes),
    notes (list of {pitch, start, end, velocity}), and duration_s."""
    from basic_pitch.inference import predict

    suffix = fmt if fmt.startswith(".") else f".{fmt}"
    with tempfile.TemporaryDirectory() as td:
        in_path = os.path.join(td, f"input{suffix}")
        with open(in_path, "wb") as f:
            f.write(audio_bytes)
        # basic-pitch writes <input_stem>.mid + note events to out_dir.
        out_dir = os.path.join(td, "out")
        os.makedirs(out_dir, exist_ok=True)
        _, midi_data, note_events = predict(
            in_path,
            onset_threshold=onset_threshold,
            frame_threshold=frame_threshold,
        )
        midi_path = os.path.join(out_dir, "input.mid")
        midi_data.write(midi_path)
        with open(midi_path, "rb") as f:
            midi_bytes = f.read()

    # note_events: a list of tuples (start_s, end_s, pitch, velocity, onsets).
    notes = []
    try:
        for ev in note_events or []:
            start, end, pitch, velocity, _ = ev
            notes.append({
                "pitch": int(pitch),
                "start": float(start),
                "end": float(end),
                "velocity": int(velocity),
            })
    except Exception as e:
        logger.warning(f"note event serialization skipped: {e}")

    wav_bytes = midi_to_wav(midi_bytes)
    return {
        "midi": midi_bytes,
        "wav": wav_bytes,
        "notes": notes,
        "num_notes": len(notes),
    }
