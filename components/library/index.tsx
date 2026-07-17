"use client";

import { useEffect, useState, useRef } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { uploadToLibrary, listLibrary, deleteFromLibrary } from "@/lib/music";

type LibFile = { name: string; url: string; id: string };

export default function Library({ compact }: { compact?: boolean }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<LibFile[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    if (!isSupabaseConfigured) return;
    try {
      setFiles(await listLibrary());
    } catch (e) {
      setStatus("⚠️ " + (e instanceof Error ? e.message : "list failed"));
    }
  }

  useEffect(() => {
    refresh();
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
      if (playing === id) setPlaying(null);
      await refresh();
    } catch (err) {
      setStatus("⚠️ " + (err instanceof Error ? err.message : "delete failed"));
    } finally {
      setBusy(false);
    }
  }

  function togglePlay(id: string, url: string) {
    if (playing === id) {
      audioRef.current?.pause();
      setPlaying(null);
    } else {
      audioRef.current?.pause();
      const audio = new Audio(url);
      audio.onended = () => setPlaying(null);
      audio.play();
      audioRef.current = audio;
      setPlaying(id);
    }
  }

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

      <div
        ref={dropRef}
        className="drop-zone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
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
      <span className="status">{status}</span>

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
            <li key={f.id}>
              <div className="file-info">
                <span className="file-name">{f.name}</span>
              </div>
              <div className="file-actions">
                <button
                  className="chip"
                  onClick={() => togglePlay(f.id, f.url)}
                >
                  {playing === f.id ? "⏸ Pause" : "▶ Play"}
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
    </>
  );
}
