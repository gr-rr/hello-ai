"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { uploadToLibrary, listLibrary } from "@/lib/music";

export default function Library() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);

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

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus("Uploading…");
    try {
      const url = await uploadToLibrary(file.name, file);
      setStatus("Saved ✓ " + file.name);
      await refresh();
    } catch (err) {
      setStatus("⚠️ " + (err instanceof Error ? err.message : "upload failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="header">
        <span className="badge">Finetune Studio · Library</span>
        <h1>Your music library</h1>
        <p>
          Upload audio files (WAV, MP3, …) to transcribe and analyze later.
          Stored in Supabase and available to the Transcribe tab.
        </p>
      </div>

      <div className="panel">
        <label>Upload audio</label>
        <input type="file" accept="audio/*" onChange={onUpload} disabled={busy} />
        <span className="status">{status}</span>
      </div>

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
            <li key={f.name}>
              <span>{f.name}</span>
              <a className="chip ghost" href={f.url} target="_blank" rel="noreferrer">
                Open
              </a>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
