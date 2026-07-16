"use client";

import { useEffect, useState } from "react";
import {
  uploadDataset,
  listDatasets,
  downloadDataset,
  STARTER_DATASET,
  generateSyntheticDataset,
  rowsToJsonl,
} from "@/lib/finetune";
import { isSupabaseConfigured } from "@/lib/supabase";

export default function DataStudio() {
  const [text, setText] = useState("");
  const [name, setName] = useState("my-dataset");
  const [datasets, setDatasets] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!isSupabaseConfigured) return;
    try {
      setDatasets(await listDatasets());
    } catch (e) {
      setStatus("⚠️ " + (e instanceof Error ? e.message : "list failed"));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function loadStarter() {
    setText(rowsToJsonl(STARTER_DATASET));
    setName("starter-translate");
    setStatus("Loaded starter dataset (8 rows).");
  }

  function loadSynthetic() {
    setText(rowsToJsonl(generateSyntheticDataset(12)));
    setName("synthetic-12");
    setStatus("Generated 12 synthetic rows.");
  }

  async function save() {
    if (!isSupabaseConfigured) {
      setStatus("⚠️ Supabase not configured.");
      return;
    }
    if (!text.trim()) {
      setStatus("⚠️ Nothing to save.");
      return;
    }
    try {
      text.split("\n").filter(Boolean).forEach((l) => JSON.parse(l));
    } catch {
      setStatus("⚠️ Invalid JSONL — each line must be a JSON object.");
      return;
    }
    setBusy(true);
    setStatus("Saving…");
    try {
      const path = await uploadDataset(name || "dataset", text);
      setStatus("Saved ✓ " + path);
      await refresh();
    } catch (e) {
      setStatus("⚠️ " + (e instanceof Error ? e.message : "save failed"));
    } finally {
      setBusy(false);
    }
  }

  async function preview(path: string) {
    try {
      const content = await downloadDataset(path);
      setText(content);
      setName(path.replace(/^datasets\//, "").replace(/\.jsonl$/, ""));
      setStatus("Loaded " + path);
    } catch (e) {
      setStatus("⚠️ " + (e instanceof Error ? e.message : "load failed"));
    }
  }

  return (
    <>
      <div className="header">
        <span className="badge">Finetune Studio · Datasets</span>
        <h1>Datasets</h1>
        <p>
          Prepare instruction/response JSONL for fine-tuning. Each line is a JSON
          object with <code>instruction</code>, optional <code>input</code>, and{" "}
          <code>output</code>. Start from a seed or generate synthetic rows, then
          save to Supabase and use it in the Train tab.
        </p>
      </div>

      <div className="panel">
        <div className="row">
          <input
            className="text"
            placeholder="dataset name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="chip ghost" onClick={loadStarter}>
            Load starter
          </button>
          <button className="chip ghost" onClick={loadSynthetic}>
            Generate synthetic
          </button>
        </div>
        <textarea
          className="jsonl"
          spellCheck={false}
          placeholder={'{"instruction": "...", "output": "..."}'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="row">
          <button className="save" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save to Supabase"}
          </button>
          <span className="status">{status}</span>
        </div>
      </div>

      <div className="panel">
        <h3>Saved datasets</h3>
        {!isSupabaseConfigured && (
          <p className="muted">Supabase not configured — connect to enable storage.</p>
        )}
        {isSupabaseConfigured && datasets.length === 0 && (
          <p className="muted">No datasets yet.</p>
        )}
        <ul className="filelist">
          {datasets.map((d) => (
            <li key={d}>
              <span>{d}</span>
              <button className="chip ghost" onClick={() => preview(d)}>
                Edit
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="footer">
        Stored in the Supabase <code>datasets</code> bucket. RLS allows public
        read/insert for this demo.
      </div>
    </>
  );
}
