"use client";

import { useState } from "react";
import MusicGen from "./MusicGen";
import Chat from "./Chat";
import DataStudio from "./DataStudio";
import TrainStudio from "./TrainStudio";
import CompareStudio from "./CompareStudio";

export type Tab = "overview" | "music" | "chat" | "data" | "train" | "compare";

const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: "music", label: "🎵 Music", desc: "Text-to-music with MusicGen (server-side)" },
  { id: "chat", label: "💬 Chat", desc: "Local LLM chat in your browser (WebGPU)" },
  { id: "data", label: "📚 Datasets", desc: "Prepare instruction/response JSONL" },
  { id: "train", label: "🧬 Train", desc: "Fine-tune a small LLM with LoRA" },
  { id: "compare", label: "⚖️ Compare", desc: "Side-by-side model outputs" },
];

export default function Studio({ initialTab = "overview" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);

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
      {tab === "data" && <DataStudio />}
      {tab === "train" && <TrainStudio />}
      {tab === "compare" && <CompareStudio />}
    </main>
  );
}
