"use client";

import { useState, useRef } from "react";
import {
  transcribeAudio,
  uploadToLibrary,
  wavToDataUrl,
  midiToDataUrl,
  type TranscribeResult,
} from "@/lib/music";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function pitchToName(p: number): string {
  const name = NOTE_NAMES[((p % 12) + 12) % 12];
  const octave = Math.floor(p / 12) - 1;
  return `${name}${octave}`;
}

export default function Transcribe() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TranscribeResult | null>(null);
  const [audioName, setAudioName] = useState("");
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus("Transcribing… (basic-pitch on the Oracle backend)");
    setResult(null);
    setAudioName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(
        new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""),
      );
      const fmt = (file.name.split(".").pop() || "wav").toLowerCase();
      const res = await transcribeAudio(b64, fmt);
      setResult(res);
      setStatus(`Done — ${res.num_notes} notes extracted.`);
    } catch (err) {
      setStatus("⚠️ " + (err instanceof Error ? err.message : "transcription failed"));
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        await handleRecording(blob);
      };
      rec.start();
      mediaRef.current = rec;
      setRecording(true);
      setStatus("Recording… click Stop when done.");
    } catch (err) {
      setStatus("⚠️ Mic access denied: " + (err instanceof Error ? err.message : ""));
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    mediaRef.current = null;
    setRecording(false);
  }

  async function handleRecording(blob: Blob) {
    setBusy(true);
    setResult(null);
    const name = `recording-${Date.now()}.webm`;
    setAudioName(name);
    try {
      setStatus("Saving recording to library…");
      await uploadToLibrary(name, blob);
      setStatus("Transcribing… (basic-pitch on the Oracle backend)");
      const buf = await blob.arrayBuffer();
      const b64 = btoa(
        new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""),
      );
      const fmt = (blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "mp4" : "webm");
      const res = await transcribeAudio(b64, fmt);
      setResult(res);
      setStatus(`Done — ${res.num_notes} notes extracted.`);
    } catch (err) {
      setStatus("⚠️ " + (err instanceof Error ? err.message : "transcription failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="header">
        <span className="badge">Finetune Studio · Transcribe</span>
        <h1>Audio → MIDI</h1>
        <p>
          Transcribe audio to a symbolic score with basic-pitch (Spotify, Apache-2.0),
          then hear a synthesized rendering. The extracted notes are your linked
          audio/text representation for later analysis.
        </p>
      </div>

      <div className="panel">
        <label>Audio file</label>
        <input type="file" accept="audio/*" onChange={onFile} disabled={busy} />
        <span className="status">{status}</span>
      </div>

      <div className="panel">
        <label>Or record live audio</label>
        {!recording ? (
          <button className="chip" onClick={startRecording} disabled={busy}>
            ● Record
          </button>
        ) : (
          <button className="chip ghost" onClick={stopRecording}>
            ■ Stop
          </button>
        )}
        <span className="muted">
          Recordings are saved to your library, then transcribed.
        </span>
      </div>

      {result && (
        <div className="panel">
          <h3>Transcription of {audioName}</h3>
          <p className="muted">{result.num_notes} notes</p>
          <h4>Synthesized MIDI (WAV)</h4>
          {result.wav_url && <audio controls src={result.wav_url} />}
          {result.wav_base64 && !result.wav_url && (
            <audio controls src={wavToDataUrl(result.wav_base64)} />
          )}
          <h4>MIDI file</h4>
          {result.midi_url && (
            <a className="chip ghost" href={result.midi_url} target="_blank" rel="noreferrer">
              Download .mid
            </a>
          )}
          <h4>Note events</h4>
          <div className="notes-grid">
            {result.notes.slice(0, 64).map((n, i) => (
              <span key={i} className="note-chip">
                {pitchToName(n.pitch)} @ {n.start.toFixed(2)}s
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
