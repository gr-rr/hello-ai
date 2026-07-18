"use client";

import { useEffect, useState, useRef } from "react";
import {
  transcribeAudio,
  enhanceAudio,
  wavToDataUrl,
  midiToDataUrl,
  listLibrary,
  type TranscribeResult,
  type LibFile,
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
  const [libFiles, setLibFiles] = useState<LibFile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listLibrary().then(setLibFiles).catch((err) => {
      setStatus("\u26A0 " + (err instanceof Error ? err.message : "failed to load library"));
    });
  }, []);

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
      setStatus("Cleaning audio\u2026");
      const clean = await enhanceAudio(b64, fmt);

      setState("transcribing");
      setStatus("Transcribing\u2026");
      const res = await transcribeAudio(clean.wav_base64, "wav");
      setResult(res);
      setState("populated");
      setStatus(`${res.num_notes} notes extracted`);
      onTranscribed?.(res, audioName);
    } catch (err) {
      setState("error");
      setStatus("\u26A0 " + (err instanceof Error ? err.message : "transcription failed"));
    }
  }

  async function handleFilePick(file: File) {
    setAudioName(file.name);
    await processBlob(file);
  }

  async function onUploadNew(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await handleFilePick(file);
  }

  async function onSelectLibrary(id: string) {
    if (id === "__upload_new__") {
      inputRef.current?.click();
      return;
    }
    if (!id) return;
    setSelectedId(id);
    const file = libFiles.find((f) => f.id === id);
    if (!file) return;
    setAudioName(file.name);
    setStatus("Downloading\u2026");
    try {
      const res = await fetch(file.url);
      if (!res.ok) {
        throw new Error(`download failed: ${res.status} ${res.statusText}`);
      }
      const blob = await res.blob();
      await processBlob(blob);
    } catch (err) {
      setState("error");
      setStatus("\u26A0 " + (err instanceof Error ? err.message : "download failed"));
    }
  }

  function reset() {
    setState("idle");
    setResult(null);
    setAudioName("");
    setStatus("");
    setSelectedId("");
  }

  return (
    <>
      {state === "idle" && (
        <div>
          <h3 className="stage-h3">\uD83C\uDFBC Transcribe</h3>

          <div className="panel" style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6, color: "var(--muted)" }}>
              Select from library
            </label>
            <select
              className="sel"
              value={selectedId}
              onChange={(e) => onSelectLibrary(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "var(--panel-2)", color: "var(--fg)", border: "1px solid var(--border)", fontSize: 14 }}
            >
              <option value="">\u2014 Choose a file \u2014</option>
              {libFiles.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
              <option value="__upload_new__">\u2795 Upload new\u2026</option>
            </select>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            onChange={onUploadNew}
            style={{ display: "none" }}
          />

          {libFiles.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              No files in your library yet. Upload audio in the Library tab or use Upload new above.
            </p>
          )}
        </div>
      )}

      {(state === "enhancing" || state === "transcribing") && (
        <div>
          <h3 className="stage-h3">\uD83C\uDFBC Transcribe</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div className="chip" style={{ background: "var(--panel-3)", cursor: "default" }}>
              {audioName || "audio"}
            </div>
            <span className="muted">{status}</span>
          </div>

          <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Piano Roll</h4>
          <div className="drop-zone pulse" style={{ cursor: "default", borderStyle: "solid", padding: 20 }}>
            <span style={{ fontSize: 13 }}>Processing audio\u2026</span>
          </div>

          <h4 style={{ margin: "12px 0 6px", fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sheet Music</h4>
          <div className="drop-zone pulse" style={{ cursor: "default", borderStyle: "solid", padding: 20, marginTop: 8 }}>
            <span style={{ fontSize: 13 }}>Processing audio\u2026</span>
          </div>
        </div>
      )}

      {state === "populated" && result && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h3 className="stage-h3" style={{ margin: 0 }}>\uD83C\uDFBC {audioName}</h3>
              <p className="muted" style={{ margin: "4px 0 0" }}>{result.num_notes} notes</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {result.analysis && onGoToAnalyze && (
                <button className="btn btn-primary" onClick={onGoToAnalyze}>
                  \uD83D\uDCCA View Analysis
                </button>
              )}
              <button className="btn btn-ghost" onClick={reset}>\u2715 Clear</button>
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
              <a className="chip ghost" href={result.midi_url} target="_blank" rel="noreferrer">\u2B07 Download MIDI</a>
            ) : result.midi_base64 ? (
              <a className="chip ghost" href={midiToDataUrl(result.midi_base64)} download="transcription.mid">\u2B07 Download MIDI</a>
            ) : null}
          </div>

          <h4 style={{ margin: "12px 0 6px", fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sheet Music</h4>
          <Score notes={result.notes} />
        </div>
      )}

      {state === "error" && (
        <div>
          <h3 className="stage-h3">\uD83C\uDFBC Transcribe</h3>
          <div className="panel" style={{ borderColor: "rgba(239,68,68,0.3)" }}>
            <p className="status" style={{ color: "var(--danger)" }}>{status}</p>
            <button className="btn" onClick={reset}>Try again</button>
          </div>
        </div>
      )}
    </>
  );
}
