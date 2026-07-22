"use client";

import { useEffect, useState, useRef } from "react";
import {
  transcribeAudio,
  enhanceAudio,
  listLibrary,
  uploadToLibrary,
  saveTranscription,
  blobToBase64,
  type TranscribeResult,
  type LibFile,
} from "@/lib/music";
import { useAuth } from "@/components/AuthProvider";
import PianoRoll from "@/components/PianoRoll";
import Spectrogram from "@/components/Spectrogram";
import ChromaHeatmap from "@/components/ChromaHeatmap";
import Tonnetz from "@/components/Tonnetz";

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
  signedIn,
  onTranscribed,
  onGoToAnalyze,
  onAnalyze,
  libraryFileToLoad,
  onClearLibraryFile,
  onTranscriptionSaved,
}: {
  signedIn?: boolean;
  onTranscribed?: (result: TranscribeResult, name: string) => void;
  onGoToAnalyze?: () => void;
  onAnalyze?: (audioBase64?: string, midiBase64?: string, name?: string) => void;
  libraryFileToLoad?: LibFile | null;
  onClearLibraryFile?: () => void;
  onTranscriptionSaved?: () => void;
}) {
  const { user } = useAuth();
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<TranscribeResult | null>(null);
  const [audioName, setAudioName] = useState("");
  const [analyzeBase64, setAnalyzeBase64] = useState("");
  const [status, setStatus] = useState("");
  const [libFiles, setLibFiles] = useState<LibFile[]>([]);
  const [showLibPicker, setShowLibPicker] = useState(false);
  const [recording, setRecording] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [saved, setSaved] = useState(false);
  const [wasLibraryFile, setWasLibraryFile] = useState(false);

  useEffect(() => {
    listLibrary()
      .then(setLibFiles)
      .catch((err) => {
        setStatus(
          "⚠️ Could not load your library: " +
            (err instanceof Error ? err.message : "unknown error"),
        );
      });
  }, []);

  useEffect(() => {
    if (libraryFileToLoad) {
      onSelectLibraryFile(libraryFileToLoad);
      onClearLibraryFile?.();
    }
  }, [libraryFileToLoad]);

  async function processBlob(blob: Blob, fmtOverride?: string, sourceLibId?: string | null) {
    setResult(null);
    setShowLibPicker(false);
    setPlayhead(0);
    setWasLibraryFile(false);
    try {
      const b64 = await blobToBase64(blob);
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
      setAnalyzeBase64(transcribeBase64);
      setState("populated");
      setStatus(`${res.num_notes} notes extracted`);
      onTranscribed?.(res, audioName);

      if (signedIn && res.wav_url && res.notes.length > 0) {
        try {
          if (sourceLibId) {
            await saveTranscription(sourceLibId, res.notes);
          } else {
            const audioBlob = await (await fetch(res.wav_url)).blob();
            const { id } = await uploadToLibrary(audioName || "transcription.wav", audioBlob);
            await saveTranscription(id, res.notes);
          }
          setSaved(true);
          onTranscriptionSaved?.();
        } catch (e) {
          console.error("auto-save failed", e);
        }
      }
    } catch (err) {
      setState("error");
      setStatus("⚠️ " + (err instanceof Error ? err.message : "transcription failed"));
    }
  }

  async function handleFilePick(file: File) {
    setAudioName(file.name);
    await processBlob(file);
  }

  function onUploadNew(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    handleFilePick(file);
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
        const mimeType = rec.mimeType || "audio/webm";
        const ext = mimeType.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioName(`recording-${Date.now()}.${ext}`);
        await processBlob(blob);
      };
      rec.start();
      setRecording(true);
      setStatus("Recording…");
    } catch (err) {
      setState("error");
      setStatus("⚠️ " + (err instanceof Error ? err.message : "recording failed"));
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
    setAnalyzeBase64("");
    setStatus("");
    setShowLibPicker(false);
    setPlayhead(0);
    setSaved(false);
    setWasLibraryFile(false);
  }

  async function saveToLibrary() {
    if (!result || !result.wav_url) return;
    if (wasLibraryFile) {
      setSaved(true);
      setStatus("✓ Already in library");
      return;
    }
    try {
      setStatus("Saving to library…");
      const blob = await (await fetch(result.wav_url)).blob();
      const { id } = await uploadToLibrary(audioName || "transcription.wav", blob);
      if (result.notes.length) {
        await saveTranscription(id, result.notes);
      }
      setSaved(true);
      onTranscriptionSaved?.();
      setStatus("✓ Saved to library");
    } catch (err) {
      setStatus("⚠️ " + (err instanceof Error ? err.message : "save failed"));
    }
  }

  async function onSelectLibraryFile(file: LibFile) {
    setAudioName(file.name);
    setShowLibPicker(false);
    setWasLibraryFile(true);

    if (file.notes && file.notes.length > 0) {
      setResult({
        notes: file.notes,
        num_notes: file.notes.length,
        wav_url: file.url,
      });
      setState("populated");
      setStatus(`${file.notes.length} notes loaded from library`);
      setPlayhead(0);
      return;
    }

    setState("transcribing");
    setStatus("Transcribing from library…");
    try {
      const res = await transcribeAudio(undefined, audioFmtFromName(file.name), file.id);
      setResult(res);
      setAnalyzeBase64(res.wav_base64 ?? "");
      setState("populated");
      setStatus(`${res.num_notes} notes extracted`);
      onTranscribed?.(res, audioName);

      if (signedIn && res.notes.length > 0) {
        try {
          await saveTranscription(file.id, res.notes);
          setSaved(true);
          onTranscriptionSaved?.();
        } catch (e) {
          console.error("auto-save transcription failed", e);
        }
      }
    } catch (err) {
      setState("error");
      setStatus("⚠️ " + (err instanceof Error ? err.message : "transcription failed"));
    }
  }

  const canUseLibrary = signedIn && libFiles.length > 0;

  return (
    <div className="card">
      <h3 className="card-title"><span className="glyph">♪</span> Transcribe</h3>

      {state === "idle" && !showLibPicker && (
        <>
          <div className="section-label">Choose an audio source</div>
          <div className="source-grid">
            <button className="source-card" onClick={() => inputRef.current?.click()} type="button">
              <span className="sc-icon">⬆</span>
              <span className="sc-label">Upload file</span>
              <span className="sc-hint">WAV · MP3 · M4A</span>
              <input
                ref={inputRef}
                type="file"
                accept="audio/*"
                onChange={onUploadNew}
                style={{ display: "none" }}
              />
            </button>
            <button className="source-card" onClick={recording ? stopRecording : startRecording} type="button">
              <span className="sc-icon">{recording ? "■" : "●"}</span>
              <span className="sc-label">{recording ? "Stop" : "Record"}</span>
              <span className="sc-hint">Use your mic</span>
            </button>
            <button
              className={`source-card${canUseLibrary ? "" : " disabled"}`}
              onClick={() => canUseLibrary && setShowLibPicker(true)}
              disabled={!canUseLibrary}
              type="button"
            >
              <span className="sc-icon">▤</span>
              <span className="sc-label">From library</span>
              <span className="sc-hint">
                {!signedIn ? "Sign in" : libFiles.length === 0 ? "No saved tracks" : "Pick a track"}
              </span>
            </button>
          </div>

          {!signedIn && (
            <p className="muted" style={{ fontSize: "var(--fs-sm)", textAlign: "center" }}>
              Transcribe freely — sign in to save results to your library.
            </p>
          )}
        </>
      )}

      {showLibPicker && (
        <>
          <div className="section-label">Pick a saved track</div>
          {libFiles.map((f) => (
              <div key={f.id} className="track" style={{ cursor: "pointer" }} onClick={() => onSelectLibraryFile(f)}>
                <div className="track-head">
                  <div className="track-name">{f.name}</div>
                  <div className="track-actions">
                    <span className="chip">Transcribe</span>
                  </div>
                </div>
              </div>
            ))}
          <div className="toolbar">
            <button className="btn btn-ghost" onClick={() => setShowLibPicker(false)}>Back</button>
          </div>
        </>
      )}

      {(state === "enhancing" || state === "transcribing") && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", margin: "var(--s-3) 0" }}>
            <span className="chip-q major" style={{ borderRadius: "var(--r-md)" }}>{audioName || "audio"}</span>
            <span className="status" style={{ fontSize: "var(--fs-sm)" }}>{status}</span>
          </div>
          <div className="pulse" style={{ height: 8, width: "60%", background: "var(--panel-3)", borderRadius: "var(--r-full)", marginBottom: "var(--s-4)" }} />
        </>
      )}

      {state === "populated" && result && (
        <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "var(--s-2)" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "var(--fs-base)" }}>{audioName}</h3>
                <p className="muted" style={{ margin: "var(--s-1) 0 0" }}>{result.num_notes} notes</p>
              </div>
              <div style={{ display: "flex", gap: "var(--s-2)" }}>
                {!saved && signedIn && (
                  <button className="btn" onClick={saveToLibrary}>
                    Save to library
                  </button>
                )}
              {saved && (
                <span className="chip" style={{ cursor: "default" }}>{wasLibraryFile ? "✓ Transcribed" : "✓ Saved"}</span>
              )}
              {onGoToAnalyze && onAnalyze && (result?.wav_base64 || result?.midi_base64) && (
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      try {
                        await onAnalyze(result.wav_base64, result.midi_base64, audioName);
                      } catch {
                        /* analysisError surfaces on the Analyze tab */
                      }
                      onGoToAnalyze();
                    }}
                  >
                    Analyze
                  </button>
              )}
              <button className="btn btn-ghost" onClick={reset}>✕ Clear</button>
            </div>
          </div>

          <div className="section-label">Playback</div>
          {result.wav_url && (
            <audio
              ref={audioRef}
              controls
              src={result.wav_url}
              style={{ width: "100%", marginBottom: "var(--s-2)" }}
              onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
              onPlay={() => setPlayhead(audioRef.current?.currentTime ?? 0)}
            />
          )}

          <div className="section-label">Piano roll</div>
          {result.notes.length > 0 && (
            <div className="card">
              <PianoRoll
                notes={result.notes}
                playheadTime={playhead}
                bpm={result.analysis?.tempo?.bpm ?? 120}
              />
            </div>
          )}

          {result.wav_url && <Spectrogram url={result.wav_url} />}

          {result.notes.length > 0 && (
            <>
              <ChromaHeatmap notes={result.notes} />
              <Tonnetz notes={result.notes} />
            </>
          )}
        </>
      )}

      {state === "error" && (
        <div className="alert-danger" style={{ marginTop: "var(--s-3)" }}>
          <p className="status" style={{ color: "var(--danger)", margin: 0 }}>{status}</p>
          <button className="btn" onClick={reset}>Try again</button>
        </div>
      )}
    </div>
  );
}
