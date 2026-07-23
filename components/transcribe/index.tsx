"use client";

import { useEffect, useState, useRef } from "react";
import {
  transcribeAudio,
  enhanceAudio,
  analyzeAudio,
  listLibrary,
  uploadToLibrary,
  saveTranscription,
  blobToBase64,
  type TranscribeResult,
  type LibFile,
} from "@/lib/music";
import { saveLocalTranscription } from "@/lib/browser-store";
import { synthMidi, type SynthHandle } from "@/lib/midi-synth";
import { useAuth } from "@/components/AuthProvider";
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
  signedIn,
  onTranscribed,
  onGoToAnalyze,
  onAnalyze,
  libraryFileToLoad,
  onClearLibraryFile,
  onTranscriptionSaved,
  onBusyChange,
  initialResult,
  initialAudioName,
}: {
  signedIn?: boolean;
  onTranscribed?: (result: TranscribeResult, name: string) => void;
  onGoToAnalyze?: () => void;
  onAnalyze?: (midiBase64?: string, name?: string, libraryFileId?: string) => void;
  libraryFileToLoad?: LibFile | null;
  onClearLibraryFile?: () => void;
  onTranscriptionSaved?: () => void;
  onBusyChange?: (busy: boolean) => void;
  initialResult?: TranscribeResult | null;
  initialAudioName?: string;
}) {
  const { user } = useAuth();
  const [state, setState] = useState<State>(() => initialResult ? "populated" : "idle");
  const [result, setResult] = useState<TranscribeResult | null>(initialResult ?? null);
  const [audioName, setAudioName] = useState(initialAudioName ?? "");
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
  const [libraryFileId, setLibraryFileId] = useState<string | null>(null);
  const originalBlobRef = useRef<Blob | null>(null);
  const synthRef = useRef<SynthHandle | null>(null);
  const [midiPlaying, setMidiPlaying] = useState(false);

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
    return () => { synthRef.current?.stop(); };
  }, []);

  useEffect(() => {
    onBusyChange?.(state === "enhancing" || state === "transcribing");
  }, [state, onBusyChange]);

  useEffect(() => {
    if (libraryFileToLoad) {
      onSelectLibraryFile(libraryFileToLoad);
      onClearLibraryFile?.();
    }
  }, [libraryFileToLoad]);

  async function processBlob(blob: Blob, fileName: string, fmtOverride?: string, sourceLibId?: string | null) {
    setResult(null);
    setShowLibPicker(false);
    setPlayhead(0);
    setWasLibraryFile(false);
    originalBlobRef.current = blob;
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
      onTranscribed?.(res, fileName);

      if (signedIn && res.notes.length > 0) {
        try {
          let savedId: string;
          if (sourceLibId) {
            savedId = sourceLibId;
          } else {
            const { id } = await uploadToLibrary(fileName || "audio", originalBlobRef.current!);
            savedId = id;
          }
          setLibraryFileId(savedId);

          let analysisResult: TranscribeResult["analysis"] = res.analysis ?? undefined;
          if (!analysisResult && res.midi_base64) {
            try {
              analysisResult = await analyzeAudio(res.midi_base64);
              setAnalyzeBase64(res.midi_base64);
            } catch {
              // analysis failed, continue without it
            }
          }

          await saveTranscription(savedId, res.notes, res.midi_base64, analysisResult);
          setSaved(true);
          onTranscriptionSaved?.();
        } catch (e) {
          console.error("auto-save failed", e);
        }
      } else if (!signedIn && res.notes.length > 0) {
        let analysisResult: TranscribeResult["analysis"] = res.analysis ?? undefined;
        if (!analysisResult && res.midi_base64) {
          try {
            analysisResult = await analyzeAudio(res.midi_base64);
            setAnalyzeBase64(res.midi_base64);
          } catch {
            // analysis failed, continue without it
          }
        }
        saveLocalTranscription(fileName, res.notes, res.midi_base64, originalBlobRef.current ?? undefined, analysisResult);
        setSaved(true);
      }
    } catch (err) {
      setState("error");
      setStatus("⚠️ " + (err instanceof Error ? err.message : "transcription failed"));
    }
  }

  async function handleFilePick(file: File) {
    setAudioName(file.name);
    await processBlob(file, file.name);
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
        const name = `recording-${Date.now()}.${ext}`;
        setAudioName(name);
        await processBlob(blob, name);
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
    synthRef.current?.stop();
    synthRef.current = null;
    setMidiPlaying(false);
    setState("idle");
    setResult(null);
    setAudioName("");
    setAnalyzeBase64("");
    setStatus("");
    setShowLibPicker(false);
    setPlayhead(0);
    setSaved(false);
    setWasLibraryFile(false);
    setLibraryFileId(null);
    originalBlobRef.current = null;
  }

  async function saveToLibrary() {
    if (!result) return;
    if (wasLibraryFile) {
      setSaved(true);
      setStatus("✓ Already in library");
      return;
    }
    try {
      setStatus("Saving to library…");
      const blob = originalBlobRef.current;
      if (!blob) return;
      const { id } = await uploadToLibrary(audioName || "audio", blob);
      if (result.notes.length) {
        await saveTranscription(id, result.notes, result.midi_base64);
      }
      setLibraryFileId(id);
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
    setLibraryFileId(file.id);

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
      onTranscribed?.(res, file.name);

      if (signedIn && res.notes.length > 0) {
        try {
          await saveTranscription(file.id, res.notes, res.midi_base64);
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
            <div className="source-card" onClick={() => inputRef.current?.click()}>
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
            </div>
            <div className="source-card" onClick={recording ? stopRecording : startRecording}>
              <span className="sc-icon">{recording ? "■" : "●"}</span>
              <span className="sc-label">{recording ? "Stop" : "Record"}</span>
              <span className="sc-hint">Use your mic</span>
            </div>
            <div
              className={`source-card${canUseLibrary ? "" : " disabled"}`}
              onClick={() => canUseLibrary && setShowLibPicker(true)}
            >
              <span className="sc-icon">▤</span>
              <span className="sc-label">From library</span>
              <span className="sc-hint">
                {!signedIn ? "Sign in" : libFiles.length === 0 ? "No saved tracks" : "Pick a track"}
              </span>
            </div>
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
                    <span className={f.notes && f.notes.length > 0 ? "chip" : "btn btn-primary"} style={f.notes && f.notes.length > 0 ? {} : { fontSize: "var(--fs-xs)", padding: "2px 8px" }}>{f.notes && f.notes.length > 0 ? "View" : "Transcribe"}</span>
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
          <div style={{ display: "flex", gap: "var(--s-3)", marginBottom: "var(--s-2)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: "var(--fs-xs)", color: state === "enhancing" ? "var(--text)" : "var(--muted)" }}>1. Clean</span>
                <span style={{ fontSize: "var(--fs-xs)", color: state === "enhancing" ? "var(--accent)" : state === "transcribing" || state === "populated" ? "var(--success)" : "var(--muted)" }}>
                  {state === "enhancing" ? "…" : "✓"}
                </span>
              </div>
              <div style={{ height: 4, background: "var(--panel-3)", borderRadius: "var(--r-full)" }}>
                <div className="pulse" style={{ height: "100%", width: state === "enhancing" ? "60%" : "100%", background: state === "enhancing" ? "var(--accent)" : "var(--success)", borderRadius: "var(--r-full)", transition: "width 0.3s" }} />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: "var(--fs-xs)", color: state === "transcribing" ? "var(--text)" : "var(--muted)" }}>2. Transcribe</span>
                <span style={{ fontSize: "var(--fs-xs)", color: state === "transcribing" ? "var(--accent)" : "var(--muted)" }}>
                  {state === "transcribing" ? "…" : ""}
                </span>
              </div>
              <div style={{ height: 4, background: "var(--panel-3)", borderRadius: "var(--r-full)" }}>
                <div className={state === "transcribing" ? "pulse" : ""} style={{ height: "100%", width: state === "transcribing" ? "60%" : "0%", background: "var(--accent)", borderRadius: "var(--r-full)", transition: "width 0.3s" }} />
              </div>
            </div>
          </div>
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
                {!saved && signedIn && !wasLibraryFile && (
                  <button className="btn" onClick={saveToLibrary}>
                    Save to library
                  </button>
                )}
              {saved && (
                <span className="chip" style={{ cursor: "default" }}>{wasLibraryFile ? "✓ In library" : "✓ Saved"}</span>
              )}
              {onGoToAnalyze && onAnalyze && result?.notes.length > 0 && (
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      try {
                        await onAnalyze(result.midi_base64, audioName, libraryFileId ?? undefined);
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
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", marginBottom: "var(--s-2)" }}>
            <button className="icon-btn" onClick={() => {
              if (synthRef.current) {
                if (synthRef.current.isPaused) {
                  synthRef.current.resume();
                  setMidiPlaying(true);
                } else {
                  synthRef.current.pause();
                  setMidiPlaying(false);
                }
              } else if (result.notes.length > 0) {
                synthRef.current = synthMidi(result.notes, (t) => setPlayhead(t));
                setMidiPlaying(true);
              }
            }}>
              {midiPlaying ? "⏸" : "▶"}
            </button>
            <span className="muted" style={{ fontFamily: "monospace", fontSize: "var(--fs-xs)" }}>
              {Math.floor(playhead)}s — MIDI
            </span>
          </div>

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
