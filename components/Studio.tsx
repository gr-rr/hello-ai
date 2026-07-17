"use client";

import { useState } from "react";
import MusicGen from "./MusicGen";
import Chat from "./Chat";
import DataStudio from "./DataStudio";
import TrainStudio from "./TrainStudio";
import CompareStudio from "./CompareStudio";
import Piano from "./Piano";

export type Tab =
  | "overview"
  | "music"
  | "chat"
  | "piano"
  | "data"
  | "train"
  | "compare";

// Feature flags. LoRA training/compare is disabled for now — it runs on the
// CPU-only Oracle VM and can saturate it (no GPU). Re-enable here when a GPU
// shape or queue is in place.
const FEATURES = {
  data: true,
  train: false,
  compare: false,
};

const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: "music", label: "🎵 Music", desc: "Text-to-music with MusicGen (server-side)" },
  { id: "chat", label: "💬 Chat", desc: "Local LLM chat in your browser (WebGPU)" },
  { id: "piano", label: "🎹 Piano", desc: "Play a mini synthesizer (Web Audio)" },
  { id: "data", label: "📚 Datasets", desc: "Prepare instruction/response JSONL" },
  ...(FEATURES.train
    ? [{ id: "train" as Tab, label: "🧬 Train", desc: "Fine-tune a small LLM with LoRA" }]
    : []),
  ...(FEATURES.compare
    ? [{ id: "compare" as Tab, label: "⚖️ Compare", desc: "Side-by-side model outputs" }]
    : []),
];

export default function Studio({ initialTab = "overview" }: { initialTab?: Tab }) {
  const safeInitial: Tab =
    initialTab === "train" && !FEATURES.train
      ? "overview"
      : initialTab === "compare" && !FEATURES.compare
      ? "overview"
      : initialTab;
  const [tab, setTab] = useState<Tab>(safeInitial);

  if (tab === "overview") {
    return (
      <main className="page">
        <div className="header">
          <span className="badge">hello-ai · unified studio</span>
          <h1>Pick a studio</h1>
          <p>
            Music generation, a local LLM chat, and a finetune lab — all in one
            place, backed by an Oracle backend and Supabase.
          </p>
        </div>
        <div className="cards">
          {TABS.map((t) => (
            <button key={t.id} className="card" onClick={() => setTab(t.id)}>
              <span className="card-title">{t.label}</span>
              <span className="card-desc">{t.desc}</span>
            </button>
          ))}
        </div>
        <div className="footer">
          Powered by MusicGen, transformers.js, PEFT/LoRA, Oracle Cloud &amp;
          Supabase.
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="tabbar">
        <button className="back" onClick={() => setTab("overview")}>
          ← Back
        </button>
        <div className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "music" && <MusicGen />}
      {tab === "chat" && <Chat />}
      {tab === "piano" && <Piano />}
      {tab === "data" && <DataStudio />}
      {tab === "train" && <TrainStudio />}
      {tab === "compare" && <CompareStudio />}
    </main>
  );
}
