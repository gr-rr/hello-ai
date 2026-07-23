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
  convertMusicFormat,
  type TranscribeResult,
  type LibFile,
} from "@/lib/music";
import { saveLocalTranscription } from "@/lib/browser-store";
import { synthMidi, type SynthHandle } from "@/lib/midi-synth";
import { useAuth } from "@/components/AuthProvider";
import PianoRoll from "@/components/PianoRoll";
import SheetMusic from "@/components/SheetMusic";

type Mode = "transcribe" | "midi-to-score" | "audio-to-score";
type State = "idle" | "enhancing" | "transcribing" | "converting" | "populated" | "error";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "transcribe", label: "Transcribe", hint: "Audio → MIDI + notes" },
  { id: "midi-to-score", label: "MIDI → Score", hint: "MIDI file → sheet music" },
  { id: "audio-to-score", label: "Audio → Score", hint: "Audio → MIDI → sheet music" },
];

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

export default function Transform({
  signedIn,
  onTranscribed,
  onGoToAnalyze,
  onAnalyze,
  libraryFileToLoad,
  onClearLibraryFile,
  onTranscriptionSaved,
  onBusyChange,
}: {
  signedIn?: boolean;
  onTranscribed?: (result: TranscribeResult, name: string) => void;
  onGoToAnalyze?: () => void;
  onAnalyze?: (midiBase64?: string, name?: string, libraryFileId?: string) => void;
  libraryFileToLoad?: LibFile | null;
  onClearLibraryFile?: () => void;
  onTranscriptionSaved?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("transcribe");
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
  const [libraryFileId, setLibraryFileId] = useState<string | null>(null);
  const originalBlobRef = useRef<Blob | null>(null);
  const synthRef = useRef<SynthHandle | null>(null);
  const [midiPlaying, setMidiPlaying] = useState(false);
  const [musicXml, setMusicXml] = useState("");

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
    setMusicXml("");
    originalBlobRef.current = blob;

    const toScore = mode === "audio-to-score";

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
      onTranscribed?.(res, fileName);

      if (toScore && res.midi_base64) {
        setState("converting");
        setStatus("Converting to sheet music…");
        try {
          const converted = await convertMusicFormat(res.midi_base64, "midi", "musicxml");
          setMusicXml(atob(converted.data_base64));
        } catch {
          setStatus("⚠️ Could not convert to sheet music");
        }
      }

      setState("populated");
      setStatus(toScore ? "Sheet music ready" : `${res.num_notes} notes extracted`);

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

  async function handleMidiFile(file: File) {
    setAudioName(file.name);
    setResult(null);
    setShowLibPicker(false);
    setMusicXml("");
    setState("converting");
    setStatus("Converting MIDI to sheet music…");

    try {
      const b64 = await blobToBase64(file);
      const converted = await convertMusicFormat(b64, "midi", "musicxml");
      setMusicXml(atob(converted.data_base64));
      setState("populated");
      setStatus("Sheet music ready");
    } catch (err) {
      setState("error");
      setStatus("⚠️ " + (err instanceof Error ? err.message : "conversion failed"));
    }
  }

  async function handleFilePick(file: File) {
    setAudioName(file.name);
    if (mode === "midi-to-score") {
      await handleMidiFile(file);
    } else {
      await processBlob(file, file.name);
    }
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
    setMusicXml("");
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
    setMusicXml("");

    if (file.notes && file.notes.length > 0) {
      setResult({
        notes: file.notes,
        num_notes: file.notes.length,
        wav_url: file.url,
      });
      setState("populated");
      setStatus(`${file.notes.length} notes loaded from library`);
      setPlayhead(0);

      if (mode === "midi-to-score" && file.midi_base64) {
        setState("converting");
        setStatus("Converting to sheet music…");
        try {
          const converted = await convertMusicFormat(file.midi_base64, "midi", "musicxml");
          setMusicXml(atob(converted.data_base64));
          setState("populated");
          setStatus("Sheet music ready");
        } catch {
          setStatus("⚠️ Could not convert to sheet music");
          setState("populated");
        }
      }
      return;
    }

    setState("transcribing");
    setStatus("Transcribing from library…");
    try {
      const res = await transcribeAudio(undefined, audioFmtFromName(file.name), file.id);
      setResult(res);
      setAnalyzeBase64(res.wav_base64 ?? "");
      onTranscribed?.(res, file.name);

      if (mode === "audio-to-score" && res.midi_base64) {
        setState("converting");
        setStatus("Converting to sheet music…");
        try {
          const converted = await convertMusicFormat(res.midi_base64, "midi", "musicxml");
          setMusicXml(atob(converted.data_base64));
        } catch {
          setStatus("⚠️ Could not convert to sheet music");
        }
      }

      setState("populated");
      setStatus(`${res.num_notes} notes extracted`);

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

  function downloadMusicXml() {
    if (!musicXml) return;
    const blob = new Blob([musicXml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = audioName.replace(/\.[^.]+$/, "") + ".musicxml";
    a.click();
    URL.revokeObjectURL(url);
  }

  const canUseLibrary = signedIn && libFiles.length > 0;
  const acceptTypes = mode === "midi-to-score" ? ".mid,.midi,.musicxml" : "audio/*";

  return (
    <div className="card">
      <h3 className="card-title"><span className="glyph">♪</span> Transform</h3>

      <div className="section-label">Mode</div>
      <div style={{ display: "flex", gap: "var(--s-2)", marginBottom: "var(--s-3)", flexWrap: "wrap" }}>
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`chip${mode === m.id ? "" : " ghost"}`}
            onClick={() => { if (state === "idle") setMode(m.id); }}
            disabled={state !== "idle"}
            title={m.hint}
          >
            {m.label}
          </button>
        ))}
      </div>

      {state === "idle" && !showLibPicker && (
        <>
          <div className="section-label">
            {mode === "transcribe" && "Choose an audio source"}
            {mode === "midi-to-score" && "Choose a MIDI file"}
            {mode === "audio-to-score" && "Choose an audio source"}
          </div>
          <div className="source-grid">
            <div className="source-card" onClick={() => inputRef.current?.click()}>
              <span className="sc-icon">⬆</span>
              <span className="sc-label">Upload file</span>
              <span className="sc-hint">
                {mode === "midi-to-score" ? "MIDI files" : "WAV · MP3 · M4A"}
              </span>
              <input
                ref={inputRef}
                type="file"
                accept={acceptTypes}
                onChange={onUploadNew}
                style={{ display: "none" }}
              />
            </div>
            {mode !== "midi-to-score" && (
              <div className="source-card" onClick={recording ? stopRecording : startRecording}>
                <span className="sc-icon">{recording ? "■" : "●"}</span>
                <span className="sc-label">{recording ? "Stop" : "Record"}</span>
                <span className="sc-hint">Use your mic</span>
              </div>
            )}
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
              {mode === "transcribe" && "Transcribe freely — sign in to save results to your library."}
              {mode === "midi-to-score" && "Convert MIDI to sheet music — sign in to save results."}
              {mode === "audio-to-score" && "Convert audio to sheet music — sign in to save results."}
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

      {(state === "enhancing" || state === "transcribing" || state === "converting" || state === "populated") && (
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
                <p className="muted" style={{ margin: "var(--s-1) 0 0" }}>
                  {result ? `${result.num_notes} notes` : "Sheet music"}
                </p>
              </div>
              <div style={{ display: "flex", gap: "var(--s-2)" }}>
                {!saved && signedIn && result && !wasLibraryFile && (
                  <button className="btn" onClick={saveToLibrary}>
                    Save to library
                  </button>
                )}
              {saved && (
                <span className="chip" style={{ cursor: "default" }}>{wasLibraryFile ? "✓ In library" : "✓ Saved"}</span>
              )}
              {musicXml && (
                <button className="btn" onClick={downloadMusicXml}>
                  Export MusicXML
                </button>
              )}
              {onGoToAnalyze && onAnalyze && result && result.notes.length > 0 && mode === "transcribe" && (
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

          {musicXml && (
            <>
              <div className="section-label">Sheet music</div>
              <SheetMusic musicXml={musicXml} />
            </>
          )}

          {result && (
            <>
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
