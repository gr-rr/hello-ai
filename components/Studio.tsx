"use client";

import { useState } from "react";
import Library from "./library";
import Transcribe from "./transcribe";
import Analysis from "./analyze";
import type { TranscribeResult } from "@/lib/music";

const STEPS = [
  { id: "library", label: "Library", num: 1 },
  { id: "transcribe", label: "Transcribe", num: 2 },
  { id: "analyze", label: "Analyze", num: 3 },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export default function Studio({ initialTab = "transcribe" }: { initialTab?: string }) {
  const safeStep = STEPS.some((s) => s.id === initialTab) ? initialTab : "transcribe";
  const [step, setStep] = useState<StepId>(safeStep as StepId);
  const [lastResult, setLastResult] = useState<TranscribeResult | null>(null);
  const [audioName, setAudioName] = useState("");

  function onTranscribed(result: TranscribeResult, name: string) {
    setLastResult(result);
    setAudioName(name);
  }

  return (
    <div className="page">
      <div className="topbar">
        <div className="stepper">
          {STEPS.map((s) => (
            <button
              key={s.id}
              className={`stepper-step ${step === s.id ? "active" : ""}`}
              onClick={() => setStep(s.id)}
            >
              <span className="stepper-num">{s.num}</span>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {step === "library" && (
        <div className="app-grid">
          <div className="stage">
            <Library compact />
          </div>
        </div>
      )}

      {step === "transcribe" && (
        <div className="app-grid">
          <div className="stage">
            <Transcribe compact onTranscribed={onTranscribed} onGoToAnalyze={() => setStep("analyze")} />
          </div>
        </div>
      )}

      {step === "analyze" && (
        <div className="app-grid">
          <div className="stage">
            <h3 className="stage-h3">📊 Analysis</h3>
            <Analysis
              analysis={lastResult?.analysis}
              notes={lastResult?.notes ?? []}
              audioName={audioName}
              numNotes={lastResult?.num_notes ?? 0}
            />
          </div>
        </div>
      )}

      <div className="footer">basic-pitch · FluidSynth · abcjs</div>
    </div>
  );
}
