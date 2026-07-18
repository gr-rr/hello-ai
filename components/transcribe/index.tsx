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
import { useAuth } from "@/components/AuthProvider";
import { FEATURES } from "@/lib/features";
import Score from "@/components/Score";
import PianoRoll from "@/components/PianoRoll";

type State = "idle" | "enhancing" | "transcribing" | "populated" | "error";

function audioFmtFromBlob(blob: Blob): string {
  const type = blob.type.toLowerCase();
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mp4") || type.includes("m4a")) return "mp4";
  if (type.includes("flac")) return "flac";
  if (type.includes("mp3") || type.includes("mpeg")) return "mp3";
  return "wav";
}

function audioFmtFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["ogg", "mp4", "m4a", "flac", "mp3", "wav", "webm"].includes(ext)) return ext === "m4a" ? "mp4" : ext;
  return "wav";
}

export default function Transcribe({
  compact,
  onTranscribed,
  onGoToAnalyze,
}: {
  compact?: boolean;
  onTranscribed?: (result: TranscribeResult, name: string) => void;
  onGoToAnalyze?: () => void;
}) {
  const { user } = useAuth();
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<TranscribeResult | null>(null);
  const [audioName, setAudioName] = useState("");
  const [status, setStatus] = useState("");
  const [libFiles, setLibFiles] = useState<LibFile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [recording, setRecording] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    listLibrary().then(setLibFiles).catch((err) => {
      setStatus("\u26A0 " + (err instanceof Error ? err.message : "failed to load library"));
    });
  }, []);

  async function processBlob(blob: Blob, fmtOverride?: string) {
    setResult(null);
    try {
      const buf = await blob.arrayBuffer();
      const b64 = btoa(
        new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""),
      );
      const fmt = fmtOverride ?? audioFmtFromBlob(blob);

      setState("enhancing");
      setStatus("Cleaning audio…");
      let transcribeBase64 = b64;
      try {
        const clean = await enhanceAudio(b64, fmt);
        if (clean.wav_base64) transcribeBase64 = clean.wav_base64;
      } catch {
        setStatus("Cleaning skipped — transcribing raw audio…");
      }

      setState("transcribing");
      setStatus("Transcribing…");
      const res = await transcribeAudio(transcribeBase64, fmt);
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
      await processBlob(blob, audioFmtFromName(file.name));
    } catch (err) {
      setState("error");
      setStatus("\u26A0 " + (err instanceof Error ? err.message : "download failed"));
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      mediaRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioName(`recording-${Date.now()}.webm`);
        await processBlob(blob);
      };
      rec.start();
      setRecording(true);
      setStatus("Recording\u2026");
    } catch (err) {
      setState("error");
      setStatus("\u26A0 " + (err instanceof Error ? err.message : "recording failed"));
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    setRecording(false);
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
          <h3 className="stage-h3">🎼 Transcribe</h3>

          {user ? (
            <>
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
                  <option value="">— Choose a file —</option>
                  {libFiles.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                  <option value="__upload_new__">➕ Upload new…</option>
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
            </>
          ) : (
            <>
              <div
                className="drop-zone"
                onClick={() => !recording && inputRef.current?.click()}
                style={{ cursor: recording ? "default" : "pointer", marginBottom: 16 }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="audio/*"
                  onChange={onUploadNew}
                  style={{ display: "none" }}
                />
                <span style={{ fontSize: 16, fontWeight: 500 }}>⬆ Upload audio</span>
                <span className="muted" style={{ fontSize: 13 }}>Click to browse files</span>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                {!recording ? (
                  <button className="btn" onClick={startRecording} disabled={state !== "idle"} style={{ minWidth: 100 }}>
                    <span style={{ color: "var(--danger)" }}>●</span> Record
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={stopRecording}>
                    ⏹ Stop Recording
                  </button>
                )}
              </div>
            </>
          )}
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

          {FEATURES.sheetMusic && (
            <>
              <h4 style={{ margin: "12px 0 6px", fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sheet Music</h4>
              <div className="drop-zone pulse" style={{ cursor: "default", borderStyle: "solid", padding: 20, marginTop: 8 }}>
                <span style={{ fontSize: 13 }}>Processing audio…</span>
              </div>
            </>
          )}
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

          {result.notes.length > 0 && (
            <>
              <h4 style={{ margin: "12px 0 6px", fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Piano Roll</h4>
              <div className="panel">
                <PianoRoll notes={result.notes} />
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 8, margin: "8px 0 12px" }}>
            {result.midi_url ? (
              <a className="chip ghost" href={result.midi_url} target="_blank" rel="noreferrer">⬇ Download MIDI</a>
            ) : result.midi_base64 ? (
              <a className="chip ghost" href={midiToDataUrl(result.midi_base64)} download="transcription.mid">⬇ Download MIDI</a>
            ) : null}
          </div>

          {FEATURES.sheetMusic && (
            <>
              <h4 style={{ margin: "12px 0 6px", fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sheet Music</h4>
              <Score notes={result.notes} analysis={result.analysis} />
            </>
          )}
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
