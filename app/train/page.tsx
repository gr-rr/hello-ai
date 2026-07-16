"use client";

import { useEffect, useRef, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  listDatasets,
  downloadDataset,
  type Job,
  type TrainedModel,
} from "@/lib/finetune";

type BaseModel = { id: string; label: string; max_seq_len: number };

export default function TrainPage() {
  const [bases, setBases] = useState<BaseModel[]>([]);
  const [baseModel, setBaseModel] = useState("");
  const [datasets, setDatasets] = useState<string[]>([]);
  const [dataset, setDataset] = useState("");
  const [name, setName] = useState("");
  const [loraR, setLoraR] = useState(16);
  const [loraAlpha, setLoraAlpha] = useState(32);
  const [epochs, setEpochs] = useState(3);
  const [lr, setLr] = useState(2e-4);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/models/base")
      .then((r) => r.json())
      .then((d) => {
        setBases(d.models || []);
        if (d.models?.[0]) setBaseModel(d.models[0].id);
      })
      .catch(() => setStatus("⚠️ Backend unreachable."));
    if (isSupabaseConfigured) {
      listDatasets()
        .then((ds) => {
          setDatasets(ds);
          if (ds[0]) setDataset(ds[0]);
        })
        .catch(() => {});
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function poll(jobId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) return;
        const j: Job = await res.json();
        setJob(j);
        setStatus(j.status === "error" ? "⚠️ " + (j.error || "failed") : j.status);
        if (j.status === "done" || j.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          setBusy(false);
        }
      } catch {
        /* keep polling */
      }
    }, 3000);
  }

  async function start() {
    if (!baseModel || !dataset) {
      setStatus("⚠️ Pick a base model and a dataset.");
      return;
    }
    setBusy(true);
    setStatus("Starting job…");
    setJob(null);
    try {
      const dataset_text = await downloadDataset(dataset);
      const res = await fetch("/api/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_model: baseModel,
          dataset_text,
          name: name || undefined,
          lora_r: loraR,
          lora_alpha: loraAlpha,
          epochs,
          learning_rate: lr,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "train failed");
      setStatus("queued");
      poll(data.job_id);
    } catch (e) {
      setStatus("⚠️ " + (e instanceof Error ? e.message : "failed"));
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="header">
        <span className="badge">Finetune Studio · Train</span>
        <h1>Train a LoRA</h1>
        <p>
          Fine-tune a small LLM with LoRA on the Oracle backend (CPU). TinyLlama
          1.1B on a few hundred examples takes minutes. The adapter is saved to
          Supabase and appears in <a href="/compare">Compare</a>.
        </p>
      </div>

      <div className="panel">
        <label>Base model</label>
        <select value={baseModel} onChange={(e) => setBaseModel(e.target.value)}>
          {bases.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>

        <label>Dataset (Supabase)</label>
        <select value={dataset} onChange={(e) => setDataset(e.target.value)}>
          {datasets.length === 0 && <option value="">— none —</option>}
          {datasets.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        {datasets.length === 0 && (
          <p className="muted">
            No datasets. Add one in <a href="/data">Datasets</a>.
          </p>
        )}

        <label>Model name (optional)</label>
        <input
          className="text"
          placeholder="my-finetune"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="grid3">
          <div>
            <label>LoRA r</label>
            <input type="number" value={loraR} onChange={(e) => setLoraR(+e.target.value)} />
          </div>
          <div>
            <label>LoRA α</label>
            <input type="number" value={loraAlpha} onChange={(e) => setLoraAlpha(+e.target.value)} />
          </div>
          <div>
            <label>Epochs</label>
            <input type="number" step="0.5" value={epochs} onChange={(e) => setEpochs(+e.target.value)} />
          </div>
        </div>
        <label>Learning rate</label>
        <input type="number" step="1e-5" value={lr} onChange={(e) => setLr(+e.target.value)} />

        <div className="row">
          <button className="save" onClick={start} disabled={busy}>
            {busy ? "Training…" : "Start training"}
          </button>
          <span className="status">{status}</span>
        </div>
      </div>

      {job && (
        <div className="panel">
          <h3>Job {job.id.slice(0, 8)} · {job.status}</h3>
          <pre className="log">{job.loss_log || "…"}</pre>
        </div>
      )}

      <div className="footer">
        Training runs as a background task on the Oracle VM. Status is polled
        every 3s from the Supabase <code>jobs</code> table.
      </div>
    </main>
  );
}
