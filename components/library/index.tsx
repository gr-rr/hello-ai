"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  uploadToLibrary,
  listLibrary,
  listTranscriptions,
  deleteFromLibrary,
  deleteTranscription,
  type LibFile,
  type Transcription,
} from "@/lib/music";
import { fetchWorks, fetchFirstRecording, type MusopenWork } from "@/lib/musopen";
import Visualizer from "@/components/Visualizer";
import PianoRoll from "@/components/PianoRoll";

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Library({
  compact,
  signedIn,
  onSignIn,
}: {
  compact?: boolean;
  signedIn?: boolean;
  onSignIn?: () => void;
}) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<LibFile[]>([]);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [openTranscription, setOpenTranscription] = useState<Transcription | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordTimer, setRecordTimer] = useState(0);

  const [musopenWorks, setMusopenWorks] = useState<MusopenWork[]>([]);
  const [musopenOpen, setMusopenOpen] = useState(false);
  const [musopenLoading, setMusopenLoading] = useState(false);
  const [importingTrack, setImportingTrack] = useState<string | null>(null);

  const dropRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  async function refresh() {
    if (!isSupabaseConfigured) return;
    try {
      setFiles(await listLibrary());
    } catch (e) {
      setStatus("⚠️ " + (e instanceof Error ? e.message : "list failed"));
    }
  }

  async function refreshTranscriptions() {
    if (!isSupabaseConfigured) return;
    try {
      setTranscriptions(await listTranscriptions());
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : "list failed");
    }
  }

  useEffect(() => {
    if (signedIn) refreshTranscriptions();
  }, [signedIn]);

  useEffect(() => {
    if (signedIn) refresh();
  }, [signedIn]);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, []);

  async function uploadFile(file: File) {
    setBusy(true);
    setStatus("Uploading\u2026");
    try {
      await uploadToLibrary(file.name, file);
      setStatus(`Saved \u2713 ${file.name}`);
      await refresh();
    } catch (err) {
      setStatus("⚠️ " + (err instanceof Error ? err.message : "upload failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
    e.target.value = "";
  }

  async function onDelete(id: string, name: string) {
    setBusy(true);
    try {
      await deleteFromLibrary(id);
      setStatus(`Deleted ${name}`);
      if (playing === id) stopAudio();
      await refresh();
    } catch (err) {
      setStatus("⚠️ " + (err instanceof Error ? err.message : "delete failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteTranscription(id: string, title: string) {
    setBusy(true);
    try {
      await deleteTranscription(id);
      setStatus(`Deleted ${title}`);
      await refreshTranscriptions();
    } catch (err) {
      setStatus("⚠️ " + (err instanceof Error ? err.message : "delete failed"));
    } finally {
      setBusy(false);
    }
  }

  const stopAudio = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute("src");
    }
    setPlaying(null);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const playAudio = useCallback((id: string, url: string) => {
    cleanupRef.current?.();
    cleanupRef.current = null;

    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration);
    const onEnd = () => {
      stopAudio();
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);

    cleanupRef.current = () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
    };

    audio.src = url;
    audio.play().catch(() => {});
    setPlaying(id);
    setCurrentTime(0);
    setDuration(0);
  }, [stopAudio]);

  const togglePlay = useCallback((id: string, url: string) => {
    if (playing === id) {
      stopAudio();
    } else {
      playAudio(id, url);
    }
  }, [playing, stopAudio]);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    dropRef.current?.classList.add("drag-over");
  }

  function handleDragLeave() {
    dropRef.current?.classList.remove("drag-over");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dropRef.current?.classList.remove("drag-over");
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
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
        stopAudio();
        const name = `recording-${Date.now()}.webm`;
        await uploadFile(new File([blob], name));
      };
      rec.start();
      mediaRef.current = rec;
      setRecording(true);
      setRecordTimer(0);
      setStatus("Recording\u2026");
      recordTimerRef.current = setInterval(() => {
        setRecordTimer((t) => t + 1);
      }, 1000);
    } catch (err) {
      setStatus("⚠️ " + (err instanceof Error ? err.message : "Mic access denied"));
    }
  }

  function stopRecording() {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    mediaRef.current?.stop();
    mediaRef.current = null;
    setRecording(false);
    setRecordTimer(0);
  }

  async function openMusopen() {
    if (musopenOpen) {
      setMusopenOpen(false);
      return;
    }
    setMusopenLoading(true);
    setMusopenWorks([]);
    setStatus("Loading MusOpen…");
    try {
      const works = await fetchWorks();
      setMusopenWorks(works);
      setMusopenOpen(true);
      setStatus(`${works.length} works loaded from MusOpen`);
    } catch (err) {
      setStatus("⚠️ " + (err instanceof Error ? err.message : "MusOpen failed"));
    } finally {
      setMusopenLoading(false);
    }
  }

  async function importFromMusopen(work: MusopenWork) {
    const recording = fetchFirstRecording(work);
    if (!recording) {
      setStatus("\u26A0\uFE0F No recording available for " + work.title);
      return;
    }
    setImportingTrack(work.title);
    setStatus(`Importing ${work.title}\u2026`);
    try {
      const res = await fetch(recording.url);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const ext = recording.format === "wav" ? "wav" : "mp3";
      const name = `${work.composer} - ${work.title}.${ext}`.replace(/[^a-z0-9.\-_\u00C0-\u024F ]/gi, "_");
      await uploadToLibrary(name, blob);
      setStatus(`\u2713 Imported ${work.title}`);
      await refresh();
    } catch (err) {
      setStatus("\u26A0\uFE0F " + (err instanceof Error ? err.message : "import failed"));
    } finally {
      setImportingTrack(null);
    }
  }

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  const nowPlaying = files.find((f) => f.id === playing);

  return (
    <>
      {!compact && (
        <div className="header">
          <span className="badge">Audio Library</span>
          <h1>Your audio files</h1>
          <p>
            Upload or drag audio files to transcribe. Files are stored in Supabase
            and available from the Transcribe tab.
          </p>
        </div>
      )}
      {compact && <h3 className="stage-h3">📁 Library</h3>}

      {!signedIn ? (
        <div className="panel" style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          <p className="muted" style={{ margin: 0 }}>
            Sign in to access your saved library and upload audio.
          </p>
          {onSignIn && isSupabaseConfigured && (
            <button className="btn btn-primary" onClick={onSignIn} style={{ minWidth: 160, justifyContent: "center" }}>
              Sign in
            </button>
          )}
        </div>
      ) : (
        <>
          <div
            ref={dropRef}
            className="drop-zone"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !recording && inputRef.current?.click()}
            style={{ opacity: recording ? 0.4 : 1, pointerEvents: recording ? "none" : "auto" }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="audio/*"
              onChange={onUpload}
              disabled={busy}
              style={{ display: "none" }}
            />
            <span className="drop-icon">+</span>
            <span className="muted">Drop audio here or click to browse</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: 8 }}>
            {!recording ? (
              <button className="btn" onClick={startRecording} disabled={busy} style={{ minWidth: 100 }}>
                <span style={{ color: "var(--danger)" }}>●</span> Record
              </button>
            ) : (
              <button className="btn btn-primary" onClick={stopRecording}>
                ■ Stop
              </button>
            )}
            {recording && (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="record-dot" />
                <span className="muted" style={{ fontFamily: "monospace", fontSize: 14 }}>
                  {formatTime(recordTimer)}
                </span>
              </span>
            )}
            <button
              className="btn"
              onClick={openMusopen}
              disabled={busy || !!importingTrack}
              style={{ minWidth: 100 }}
            >
              {musopenLoading ? "\u23F3" : musopenOpen ? "\u2715 Close" : "\uD83C\uDFB5 MusOpen"}
            </button>
          </div>
        </>
      )}

      {musopenOpen && (
        <div className="panel" style={{ marginBottom: 8, maxHeight: 280, overflowY: "auto" }}>
          {musopenWorks.length === 0 ? (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              No works available right now. MusOpen&apos;s public API is currently
              unavailable — visit <a href="https://musopen.org/music" target="_blank" rel="noreferrer">musopen.org/music</a> to browse the catalog.
            </p>
          ) : (
            <>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>Select a work to import:</div>
          {musopenWorks.map((w) => {
            const hasRecording = fetchFirstRecording(w) !== null;
            return (
              <div
                key={w.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "4px 0",
                  borderBottom: "1px solid var(--border)",
                  opacity: !hasRecording || importingTrack !== null ? 0.5 : 1,
                }}
              >
                <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 500 }}>{w.composer}</span>
                  <span className="muted"> — </span>
                  <span>{w.title}</span>
                  <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
                    {w.epoch}
                  </span>
                </div>
                <button
                  className="chip"
                  disabled={!hasRecording || !!importingTrack}
                  onClick={() => importFromMusopen(w)}
                  style={{ whiteSpace: "nowrap", marginLeft: 8 }}
                >
                  {importingTrack === w.title ? "\u23F3" : hasRecording ? "Import" : "No audio"}
                </button>
              </div>
            );
          })}
            </>
          )}
        </div>
      )}

      <audio ref={audioRef} crossOrigin="anonymous" style={{ display: "none" }} />

      {playing && nowPlaying && (
        <div className="panel" style={{ marginTop: 4, marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontWeight: 500, fontSize: 13 }}>{nowPlaying.name}</span>
            <span className="muted" style={{ fontFamily: "monospace", fontSize: 12 }}>
              {formatTime(currentTime)} / {formatTime(duration || 0)}
            </span>
          </div>
          <div
            style={{
              width: "100%",
              height: 4,
              background: "var(--border)",
              borderRadius: 2,
              cursor: "pointer",
              marginBottom: 4,
              position: "relative",
            }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              const audio = audioRef.current;
              if (audio && duration > 0) {
                audio.currentTime = pct * duration;
              }
            }}
          >
            <div
              style={{
                width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                height: "100%",
                background: "var(--accent)",
                borderRadius: 2,
                transition: "width 0.1s linear",
              }}
            />
          </div>
          <Visualizer audioRef={audioRef} />
          <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
            <button
              className="chip ghost danger"
              onClick={stopAudio}
              style={{ fontSize: 12 }}
            >
              ■ Stop
            </button>
          </div>
        </div>
      )}

      <span className="status">{status}</span>

      <div className="panel">
        <h3>Transcriptions</h3>
        {!isSupabaseConfigured && (
          <p className="muted">Supabase not configured — connect to enable storage.</p>
        )}
        {isSupabaseConfigured && loadingLibrary && (
          <p className="muted">Loading\u2026</p>
        )}
        {isSupabaseConfigured && libraryError && (
          <p className="muted" style={{ color: "var(--danger)" }}>⚠️ {libraryError}</p>
        )}
        {isSupabaseConfigured && !loadingLibrary && !libraryError && transcriptions.length === 0 && (
          <p className="muted">
            No transcriptions yet. Transcribe audio and tap “Save to library”.
          </p>
        )}
        <ul className="filelist">
          {transcriptions.map((t) => (
            <li key={t.id} className={openTranscription?.id === t.id ? "playing" : ""}>
              <div className="file-info">
                <span className="file-name">{t.title}</span>
                <span className="muted" style={{ fontSize: 11, display: "flex", gap: 8 }}>
                  <span>{t.notes.length} notes</span>
                  {t.created_at ? <span>{formatDate(t.created_at)}</span> : null}
                </span>
              </div>
              <div className="file-actions">
                <button className="chip" onClick={() => setOpenTranscription(t)}>
                  {"\u{1F4DC} Open"}
                </button>
                <button
                  className="chip ghost danger"
                  onClick={() => onDeleteTranscription(t.id, t.title)}
                  disabled={busy}
                >
                  ✕ Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {openTranscription && (
        <div className="panel" style={{ marginTop: 8, marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontWeight: 500, fontSize: 13 }}>{openTranscription.title}</span>
            <span className="muted" style={{ fontSize: 11 }}>{openTranscription.notes.length} notes</span>
          </div>
          {openTranscription.wav_url && (
            <audio
              controls
              src={openTranscription.wav_url}
              style={{ width: "100%", marginBottom: 8 }}
            />
          )}
          {openTranscription.notes.length > 0 && (
            <div className="panel">
              <PianoRoll notes={openTranscription.notes} />
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
            <button
              className="chip ghost"
              onClick={() => setOpenTranscription(null)}
              style={{ fontSize: 12 }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <h3>Saved files</h3>
        {!isSupabaseConfigured && (
          <p className="muted">Supabase not configured — connect to enable storage.</p>
        )}
        {isSupabaseConfigured && files.length === 0 && (
          <p className="muted">No files yet.</p>
        )}
        <ul className="filelist">
          {files.map((f) => (
            <li key={f.id} className={playing === f.id ? "playing" : ""}>
              <div className="file-info">
                <span className="file-name">{f.name}</span>
                <span className="muted" style={{ fontSize: 11, display: "flex", gap: 8 }}>
                  {f.size ? <span>{formatSize(f.size)}</span> : null}
                  {f.created_at ? <span>{formatDate(f.created_at)}</span> : null}
                </span>
              </div>
              <div className="file-actions">
                <button
                  className="chip"
                  onClick={() => togglePlay(f.id, f.url)}
                >
                  {playing === f.id ? "\u23F8 Pause" : "\u25B6 Play"}
                </button>
                <button
                  className="chip ghost danger"
                  onClick={() => onDelete(f.id, f.name)}
                  disabled={busy}
                >
                  ✕ Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <style>{`
        .record-dot {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--danger);
          animation: pulse-record 1s ease-in-out infinite;
        }
        @keyframes pulse-record {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .filelist li.playing {
          background: rgba(110, 168, 254, 0.06);
          border-color: rgba(110, 168, 254, 0.2);
        }
      `}</style>
    </>
  );
}
