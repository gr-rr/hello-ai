"use client";

import { useState } from "react";
import MusicGen from "./MusicGen";
import Chat from "./Chat";
import Piano from "./Piano";
import DataStudio from "./DataStudio";
import TrainStudio from "./TrainStudio";
import CompareStudio from "./CompareStudio";
import Library from "./library";
import Transcribe from "./transcribe";

/**
 * Feature registry — the single place that defines which studios exist.
 * New features (transcription, analysis, playground, …) register here as a
 * module under components/<feature>/ exporting a default component. The tab
 * bar and router are generated from this list, so adding a feature is one entry.
 */
type Feature = {
  id: string;
  label: string;
  desc: string;
  enabled: boolean;
  Component: React.ComponentType;
};

const FEATURES: Feature[] = [
  { id: "music", label: "🎵 Music", desc: "Text-to-music with MusicGen (server-side)", enabled: true, Component: MusicGen },
  { id: "chat", label: "💬 Chat", desc: "Local LLM chat in your browser (WebGPU)", enabled: true, Component: Chat },
  { id: "piano", label: "🎹 Piano", desc: "Play a mini synthesizer (Web Audio)", enabled: true, Component: Piano },
  { id: "library", label: "📁 Library", desc: "Upload + manage your audio files", enabled: true, Component: Library },
  { id: "transcribe", label: "🎼 Transcribe", desc: "Audio → MIDI (basic-pitch)", enabled: true, Component: Transcribe },
  { id: "data", label: "📚 Datasets", desc: "Prepare instruction/response JSONL", enabled: true, Component: DataStudio },
  { id: "train", label: "🧬 Train", desc: "Fine-tune a small LLM with LoRA", enabled: true, Component: TrainStudio },
  { id: "compare", label: "⚖️ Compare", desc: "Side-by-side model outputs", enabled: true, Component: CompareStudio },
];

const TABS = FEATURES.filter((f) => f.enabled);

export default function Studio({ initialTab = "overview" }: { initialTab?: string }) {
  const safeInitial = TABS.some((t) => t.id === initialTab) ? initialTab : "overview";
  const [tab, setTab] = useState<string>(safeInitial);

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

  const active = FEATURES.find((f) => f.id === tab);
  const ActiveComponent = active?.Component;

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

      {ActiveComponent && <ActiveComponent />}
    </main>
  );
}
