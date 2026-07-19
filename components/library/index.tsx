"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  uploadToLibrary,
  listLibrary,
  deleteFromLibrary,
  type LibFile,
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

export default function Library({
  signedIn,
  onSignIn,
}: {
  signedIn?: boolean;
  onSignIn?: () => void;
}) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<LibFile[]>([]);
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
    setStatus("Uploading…");
    try {
      await uploadToLibrary(file.name, file);
      setStatus(`Saved ✓ ${file.name}`);
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
    const onEnd = () => { stopAudio(); };

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
    if (playing === id) { stopAudio(); }
    else { playAudio(id, url); }
  }, [playing, stopAudio, playAudio]);

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
      setStatus("Recording…");
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
    if (musopenOpen) { setMusopenOpen(false); return; }
    setMusopenLoading(true);
    setMusopenWorks([]);
    setStatus("Loading MusOpen…");
    try {
      const { works, error } = await fetchWorks();
      setMusopenWorks(works);
      setMusopenOpen(true);
      setStatus(error ? "⚠️ " + error : `${works.length} works loaded`);
    } catch (err) {
      setStatus("⚠️ " + (err instanceof Error ? err.message : "MusOpen failed"));
    } finally {
      setMusopenLoading(false);
    }
  }

  async function importFromMusopen(work: MusopenWork) {
    const recording = fetchFirstRecording(work);
    if (!recording) {
      setStatus("⚠️ No recording for " + work.title);
      return;
    }
    setImportingTrack(work.title);
    setStatus(`Importing ${work.title}…`);
    try {
      const res = await fetch(recording.url);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const ext = recording.format === "wav" ? "wav" : "mp3";
      const name = `${work.composer} - ${work.title}.${ext}`.replace(/[^a-z0-9.\-_\u00C0-\u024F ]/gi, "_");
      await uploadToLibrary(name, blob);
      setStatus(`✓ Imported ${work.title}`);
      await refresh();
    } catch (err) {
      setStatus("⚠️ " + (err instanceof Error ? err.message : "import failed"));
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
    <div className="card">
      <h3 className="card-title"><span className="glyph">📁</span> Library</h3>

      <div
        ref={dropRef}
        className={`drop-zone${!signedIn ? " disabled" : ""}`}
        onDragOver={signedIn ? handleDragOver : undefined}
        onDragLeave={signedIn ? handleDragLeave : undefined}
        onDrop={signedIn ? handleDrop : undefined}
        onClick={() => signedIn && !recording && inputRef.current?.click()}
        style={{ opacity: recording ? 0.4 : 1, pointerEvents: recording ? "none" : "auto" }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          onChange={onUpload}
          disabled={busy || !signedIn}
          style={{ display: "none" }}
        />
        <span className="drop-icon">+</span>
        <span className="muted">{signedIn ? "Drop audio to save to your library" : "Sign in to save audio to your library"}</span>
        <span className="muted" style={{ fontSize: 12 }}>WAV · MP3 · M4A</span>
      </div>

      <div className="toolbar">
        <button className="icon-btn" onClick={recording ? stopRecording : startRecording} disabled={busy || !signedIn}>
          {recording ? "■ Stop" : "● Record"}
        </button>
        <button
          className="icon-btn ghost"
          onClick={openMusopen}
          disabled={busy || !!importingTrack}
        >
          {musopenLoading ? "⏳" : musopenOpen ? "✕ Close" : "🎵 MusOpen"}
        </button>
      </div>

      {recording && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
          <span className="record-dot" />
          <span className="muted" style={{ fontFamily: "monospace" }}>
            {formatTime(recordTimer)}
          </span>
        </div>
      )}

      {musopenOpen && (
        <div className="card" style={{ maxHeight: 280, overflowY: "auto" }}>
          {musopenWorks.length === 0 ? (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              MusOpen API currently unavailable — visit{" "}
              <a href="https://musopen.org/music" target="_blank" rel="noreferrer">musopen.org/music</a>.
            </p>
          ) : (
            <>
              <div className="section-label">Select a work to import:</div>
              {musopenWorks.map((w) => {
                const hasRecording = fetchFirstRecording(w) !== null;
                return (
                  <div
                    key={w.id}
                    style={{
                      display: "flex", justifyContent: "space-between",
                      alignItems: "center", padding: "6px 0",
                      borderBottom: "1px solid var(--border)",
                      opacity: !hasRecording || importingTrack !== null ? 0.5 : 1,
                    }}
                  >
                    <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                      <span style={{ fontWeight: 500 }}>{w.composer}</span>
                      <span className="muted"> — </span>
                      <span>{w.title}</span>
                      <span className="muted" style={{ marginLeft: 6 }}>{w.epoch}</span>
                    </div>
                    <button
                      className="chip"
                      disabled={!hasRecording || !!importingTrack}
                      onClick={() => importFromMusopen(w)}
                    >
                      {importingTrack === w.title ? "⏳" : hasRecording ? "Import" : "No audio"}
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
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontWeight: 500, fontSize: 13 }}>{nowPlaying.name}</span>
            <span className="muted" style={{ fontFamily: "monospace", fontSize: 12 }}>
              {formatTime(currentTime)} / {formatTime(duration || 0)}
            </span>
          </div>
          <div
            className="pb-track"
            style={{ height: 4, marginBottom: 4 }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              const a = audioRef.current;
              if (a && duration > 0) a.currentTime = pct * duration;
            }}
          >
            <div className="pb-fill" style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }} />
          </div>
          {nowPlaying.notes && nowPlaying.notes.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <PianoRoll notes={nowPlaying.notes} playheadTime={currentTime} bpm={120} />
            </div>
          )}
          <Visualizer audioRef={audioRef} />
          <div className="toolbar" style={{ justifyContent: "center" }}>
            <button className="icon-btn ghost danger" onClick={stopAudio}>■ Stop</button>
          </div>
        </div>
      )}

      <span className="status">{status}</span>

      {signedIn ? (
        <>
          <div className="section-label">Tracks</div>
          {files.length === 0 ? (
            <div className="empty">No tracks yet. Transcribe audio and save it here.</div>
          ) : (
            files.map((f) => (
              <div key={f.id} className="track">
                <div className="track-head">
                  <div className="track-name">{f.name}</div>
                  <div className="track-meta">{f.size ? formatSize(f.size) : ""}</div>
                  <div className="track-actions">
                    <button className="icon-btn" onClick={() => togglePlay(f.id, f.url)}>
                      {playing === f.id ? "⏸" : "▶"}
                    </button>
                    <button className="icon-btn ghost danger" onClick={() => onDelete(f.id, f.name)} disabled={busy}>
                      ✕
                    </button>
                  </div>
                </div>
                <div className="track-artifacts">
                  <span className="artifact"><span className="dot" /> Original audio</span>
                  <span className="artifact pending"><span className="dot" /> MIDI — transcribe to generate</span>
                </div>
              </div>
            ))
          )}
        </>
      ) : (
        <div className="empty" style={{ marginTop: "var(--s-4)" }}>
          Sign in to view and manage your tracks.
        </div>
      )}

      <style>{`
        .pb-track { cursor: pointer; position: relative; }
        .record-dot { display:inline-block; width:10px; height:10px; border-radius:50%; background:var(--danger); animation:pulse-record 1s ease-in-out infinite; }
        .toolbar { display:flex; gap:var(--s-2); flex-wrap:wrap; margin-top:var(--s-3); }
        .empty { text-align:center; color:var(--muted); font-size:var(--fs-sm); padding:var(--s-5) var(--s-4); border:1px dashed var(--border); border-radius:var(--r-md); }
        .drop-zone.disabled { opacity:0.4; cursor:not-allowed; }
        .drop-zone.disabled:hover { border-color:var(--border); background:transparent; }
      `}</style>
    </div>
  );
}
