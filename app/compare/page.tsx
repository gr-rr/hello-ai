"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getModels, type TrainedModel } from "@/lib/finetune";

type BaseModel = { id: string; label: string };

export default function ComparePage() {
  const [bases, setBases] = useState<BaseModel[]>([]);
  const [baseModel, setBaseModel] = useState("");
  const [models, setModels] = useState<TrainedModel[]>([]);
  const [modelA, setModelA] = useState("base");
  const [modelB, setModelB] = useState("base");
  const [prompt, setPrompt] = useState("Translate to French: Hello, nice to meet you.");
  const [aOut, setAOut] = useState("");
  const [bOut, setBOut] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/models/base")
      .then((r) => r.json())
      .then((d) => {
        setBases(d.models || []);
        if (d.models?.[0]) setBaseModel(d.models[0].id);
      })
      .catch(() => setStatus("⚠️ Backend unreachable."));
    if (isSupabaseConfigured) getModels().then(setModels).catch(() => {});
  }, []);

  async function run() {
    if (!prompt.trim()) {
      setStatus("⚠️ Enter a prompt.");
      return;
    }
    setBusy(true);
    setStatus("Generating both…");
    setAOut("");
    setBOut("");
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          model_a: modelA,
          model_b: modelB,
          base_model: baseModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "compare failed");
      setAOut(data.a);
      setBOut(data.b);
      setStatus("Done.");
    } catch (e) {
      setStatus("⚠️ " + (e instanceof Error ? e.message : "failed"));
    } finally {
      setBusy(false);
    }
  }

  const labelFor = (ref: string) =>
    ref === "base"
      ? "base (untrained)"
      : models.find((m) => m.id === ref)?.name || ref.slice(0, 8);

  return (
    <main className="page">
      <div className="header">
        <span className="badge">Finetune Studio · Compare</span>
        <h1>Compare Models</h1>
        <p>
          Run the same prompt through two models — e.g. the base model vs. your
          fine-tuned LoRA — and compare the outputs side by side.
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

        <div className="grid2">
          <div>
            <label>Model A</label>
            <select value={modelA} onChange={(e) => setModelA(e.target.value)}>
              <option value="base">base (untrained)</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Model B</label>
            <select value={modelB} onChange={(e) => setModelB(e.target.value)}>
              <option value="base">base (untrained)</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label>Prompt</label>
        <textarea
          className="jsonl"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />

        <div className="row">
          <button className="save" onClick={run} disabled={busy}>
            {busy ? "Generating…" : "Compare"}
          </button>
          <button
            className="chip ghost"
            onClick={() => {
              setAOut("");
              setBOut("");
              run();
            }}
            disabled={busy}
          >
            ↻ Regenerate
          </button>
          <span className="status">{status}</span>
        </div>
      </div>

      <div className="compare-grid">
        <div className="panel">
          <h3>A · {labelFor(modelA)}</h3>
          <pre className="output">{aOut || "—"}</pre>
        </div>
        <div className="panel">
          <h3>B · {labelFor(modelB)}</h3>
          <pre className="output">{bOut || "—"}</pre>
        </div>
      </div>

      <div className="footer">
        Inference runs on the Oracle backend (CPU). Both models load the same
        base weights with their own LoRA adapters.
      </div>
    </main>
  );
}
