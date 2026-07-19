"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import Library from "./library";
import Transcribe from "./transcribe";
import Analysis from "./analyze";
import { analyzeAudio, type TranscribeResult } from "@/lib/music";
import { AUTH_CALLBACK_URL } from "@/lib/site";

const STEPS = [
  { id: "library", label: "Library", num: 1 },
  { id: "transcribe", label: "Transcribe", num: 2 },
  { id: "analyze", label: "Analyze", num: 3 },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export default function Studio({
  initialTab = "transcribe",
  signedIn = false,
}: {
  initialTab?: string;
  signedIn?: boolean;
}) {
  const router = useRouter();
  const safeStep = STEPS.some((s) => s.id === initialTab) ? initialTab : "transcribe";
  const [step, setStep] = useState<StepId>(safeStep as StepId);
  const [lastResult, setLastResult] = useState<TranscribeResult | null>(null);
  const [audioName, setAudioName] = useState("");
  const [analysis, setAnalysis] = useState<TranscribeResult["analysis"] | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [analyzeStatus, setAnalyzeStatus] = useState("");

  function onTranscribed(result: TranscribeResult, name: string) {
    setLastResult(result);
    setAudioName(name);
    setAnalysis(result.analysis ?? null);
    setAnalysisError("");
  }

  async function handleAnalyze(audioBase64: string, fmt: string, name: string) {
    setAudioName(name);
    setAnalyzeStatus("Analyzing audio…");
    setAnalysisError("");
    try {
      const result = await analyzeAudio(audioBase64, fmt);
      setAnalysis(result);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "analysis failed");
    } finally {
      setAnalyzeStatus("");
      goToStep("analyze");
    }
  }

  function goToStep(id: StepId) {
    setStep(id);
    router.replace(`/?tab=${id}`, { scroll: false });
  }

  async function signIn() {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: AUTH_CALLBACK_URL },
    });
  }

  return (
    <div className="page">
      <div className="topbar">
        <div className="stepper">
          {STEPS.map((s) => (
            <button
              key={s.id}
              className={`stepper-step ${step === s.id ? "active" : ""}`}
              onClick={() => goToStep(s.id)}
            >
              <span className="stepper-num">{s.num}</span>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {!signedIn && (
        <div className="hero">
          <span className="badge">AI music toolkit</span>
          <h1 className="gradient-text">Music AI Studio</h1>
          <p>
            Transcribe audio into MIDI and sheet music, then analyze your sound —
            all in one place. Sign in to save files to your library.
          </p>
          <div className="hero-actions">
            <button
              className="btn btn-primary"
              onClick={() => goToStep("transcribe")}
              style={{ minWidth: 160, justifyContent: "center" }}
            >
              🎼 Open Studio
            </button>
            {isSupabaseConfigured && (
              <button
                className="btn"
                onClick={signIn}
                style={{ minWidth: 160, justifyContent: "center" }}
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      )}

      {step === "library" && (
        <div className="app-grid">
          <div className="stage">
            <Library compact signedIn={signedIn} onSignIn={signIn} />
          </div>
        </div>
      )}

      {step === "transcribe" && (
        <div className="app-grid">
          <div className="stage">
            <Transcribe
              compact
              signedIn={signedIn}
              onTranscribed={onTranscribed}
              onGoToAnalyze={() => goToStep("analyze")}
              onAnalyze={handleAnalyze}
            />
          </div>
        </div>
      )}

      {step === "analyze" && (
        <div className="app-grid">
          <div className="stage">
            <h3 className="stage-h3">📊 Analysis</h3>
            {analyzeStatus && <p className="muted" style={{ marginBottom: 12 }}>{analyzeStatus}</p>}
            {analysisError && (
              <div className="panel" style={{ borderColor: "rgba(239,68,68,0.3)", marginBottom: 12 }}>
                <p className="status" style={{ color: "var(--danger)", margin: 0 }}>⚠️ {analysisError}</p>
              </div>
            )}
            <Analysis
              analysis={analysis}
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
