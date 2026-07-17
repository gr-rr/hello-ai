"use client";

import { useState, useRef } from "react";
import {
  transcribeAudio,
  enhanceAudio,
  wavToDataUrl,
  midiToDataUrl,
  type TranscribeResult,
} from "@/lib/music";
import Score from "@/components/Score";
import PianoRoll from "@/components/PianoRoll";

type State = "idle" | "enhancing" | "transcribing" | "populated" | "error";

export default function Transcribe({
  compact,
  onTranscribed,
  onGoToAnalyze,
}: {
  compact?: boolean;
  onTranscribed?: (result: TranscribeResult, name: string) => void;
  onGoToAnalyze?: () => void;
}) {
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<TranscribeResult | null>(null);
  const [audioName, setAudioName] = useState("");
  const [status, setStatus] = useState("");
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioName(file.name);
    await processBlob(file);
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
      setStatus("Recording…");
    } catch (err) {
      setStatus("⚠️ Mic access denied");
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    mediaRef.current = null;
    setRecording(false);
  }

  async function handleRecording(blob: Blob) {
    const name = `recording-${Date.now()}.webm`;
    setAudioName(name);
    await processBlob(blob);
  }

  async function processBlob(blob: Blob) {
    setResult(null);
    try {
      const buf = await blob.arrayBuffer();
      const b64 = btoa(
        new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""),
      );
      const fmt = blob.type.includes("ogg") ? "ogg"
        : blob.type.includes("mp4") ? "mp4" : "webm";

      setState("enhancing");
      setStatus("Cleaning audio…");
      const clean = await enhanceAudio(b64, fmt);

      setState("transcribing");
      setStatus("Transcribing…");
      const res = await transcribeAudio(clean.wav_base64, "wav");
      setResult(res);
      setState("populated");
      setStatus(`${res.num_notes} notes extracted`);
      onTranscribed?.(res, audioName);
    } catch (err) {
      setState("error");
      setStatus("⚠️ " + (err instanceof Error ? err.message : "transcription failed"));
    }
  }

  function reset() {
    setState("idle");
    setResult(null);
    setAudioName("");
    setStatus("");
  }

  return (
    <>
      {state === "idle" && (
        <div>
          <h3 className="stage-h3">🎼 Transcribe</h3>

          <div className="drop-zone" onClick={() => inputRef.current?.click()}>
            <div className="drop-icon">🎵</div>
            <div style={{ fontWeight: 500, fontSize: 14 }}>Drop audio here or click to browse</div>
            <div className="muted">WAV, MP3, M4A</div>
            <input
              ref={inputRef}
              type="file"
              accept="audio/*"
              onChange={onFile}
              style={{ display: "none" }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
            {!recording ? (
              <button className="btn" onClick={startRecording}>
                <span style={{ color: "#ef4444" }}>●</span> Record
              </button>
            ) : (
              <button className="btn btn-primary" onClick={stopRecording}>
                ■ Stop
              </button>
            )}
            <span className="muted">Record live audio from your microphone</span>
          </div>
        </div>
      )}

      {(state === "enhancing" || state === "transcribing") && (
        <div>
          <h3 className="stage-h3">🎼 Transcribe</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div className="chip" style={{ background: "var(--panel-3)", cursor: "default" }}>
              {audioName || "audio"}
            </div>
            <span className="muted">{status}</span>
          </div>

          <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Piano Roll</h4>
          <div className="drop-zone pulse" style={{ cursor: "default", borderStyle: "solid", padding: 20 }}>
            <span style={{ fontSize: 13 }}>Processing audio…</span>
          </div>

          <h4 style={{ margin: "12px 0 6px", fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sheet Music</h4>
          <div className="drop-zone pulse" style={{ cursor: "default", borderStyle: "solid", padding: 20, marginTop: 8 }}>
            <span style={{ fontSize: 13 }}>Processing audio…</span>
          </div>
        </div>
      )}

      {state === "populated" && result && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h3 className="stage-h3" style={{ margin: 0 }}>🎼 {audioName}</h3>
              <p className="muted" style={{ margin: "4px 0 0" }}>{result.num_notes} notes</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {result.analysis && onGoToAnalyze && (
                <button className="btn btn-primary" onClick={onGoToAnalyze}>
                  📊 View Analysis
                </button>
              )}
              <button className="btn btn-ghost" onClick={reset}>✕ Clear</button>
            </div>
          </div>

          <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Audio</h4>
          {result.wav_url && <audio controls src={result.wav_url} style={{ width: "100%" }} />}
          {result.wav_base64 && !result.wav_url && (
            <audio controls src={wavToDataUrl(result.wav_base64)} style={{ width: "100%" }} />
          )}

          <h4 style={{ margin: "12px 0 6px", fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Piano Roll</h4>
          <div className="panel">
            <PianoRoll notes={result.notes} />
          </div>

          <div style={{ display: "flex", gap: 8, margin: "8px 0 12px" }}>
            {result.midi_url ? (
              <a className="chip ghost" href={result.midi_url} target="_blank" rel="noreferrer">⬇ Download MIDI</a>
            ) : result.midi_base64 ? (
              <a className="chip ghost" href={midiToDataUrl(result.midi_base64)} download="transcription.mid">⬇ Download MIDI</a>
            ) : null}
          </div>

          <h4 style={{ margin: "12px 0 6px", fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sheet Music</h4>
          <Score notes={result.notes} />
        </div>
      )}

      {state === "error" && (
        <div>
          <h3 className="stage-h3">🎼 Transcribe</h3>
          <div className="panel" style={{ borderColor: "rgba(239,68,68,0.3)" }}>
            <p className="status" style={{ color: "var(--danger)" }}>{status}</p>
            <button className="btn" onClick={reset}>Try again</button>
          </div>
        </div>
      )}
    </>
  );
}
