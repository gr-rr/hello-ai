"use client";

import { useState } from "react";
import Library from "./library";
import Transcribe from "./transcribe";
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
            {lastResult?.analysis ? (
              <>
                <p className="muted" style={{ marginBottom: 16 }}>{audioName} · {lastResult.num_notes} notes</p>
                <div className="analysis-grid">
                  <div className="analysis-card fade-in">
                    <span className="analysis-label">Key</span>
                    <span className="analysis-value">{lastResult.analysis.key.tonic} {lastResult.analysis.key.mode}</span>
                    <div className="confidence-track"><div className="confidence-fill" style={{ width: `${Math.round(lastResult.analysis.key.confidence * 100)}%` }} /></div>
                    <span className="confidence-pct">{Math.round(lastResult.analysis.key.confidence * 100)}%</span>
                  </div>
                  <div className="analysis-card fade-in" style={{ animationDelay: "0.05s" }}>
                    <span className="analysis-label">Tempo</span>
                    <span className="analysis-value">{lastResult.analysis.tempo.bpm} BPM</span>
                    <div className="confidence-track"><div className="confidence-fill" style={{ width: `${Math.round(lastResult.analysis.tempo.confidence * 100)}%` }} /></div>
                    <span className="confidence-pct">{Math.round(lastResult.analysis.tempo.confidence * 100)}%</span>
                  </div>
                  <div className="analysis-card fade-in" style={{ animationDelay: "0.1s" }}>
                    <span className="analysis-label">Time signature</span>
                    <span className="analysis-value">{lastResult.analysis.time_signature.numerator}/{lastResult.analysis.time_signature.denominator}</span>
                    <div className="confidence-track"><div className="confidence-fill" style={{ width: `${Math.round(lastResult.analysis.time_signature.confidence * 100)}%` }} /></div>
                    <span className="confidence-pct">{Math.round(lastResult.analysis.time_signature.confidence * 100)}%</span>
                  </div>
                </div>
              </>
            ) : lastResult ? (
              <p className="muted">This transcription has no analysis data.</p>
            ) : (
              <p className="muted">Transcribe an audio file first, then view its analysis here.</p>
            )}
          </div>
        </div>
      )}

      <div className="footer">basic-pitch · FluidSynth · abcjs</div>
    </div>
  );
}
