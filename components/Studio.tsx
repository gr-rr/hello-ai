"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Library from "./library";
import Transcribe from "./transcribe";
import Analysis from "./analyze";
import { analyzeAudio, type TranscribeResult } from "@/lib/music";
import { AUTH_CALLBACK_URL } from "@/lib/site";

const TABS = [
  { id: "library", label: "Library", icon: "📁" },
  { id: "transcribe", label: "Transcribe", icon: "🎼" },
  { id: "analyze", label: "Analyze", icon: "📊" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Studio({
  initialTab = "transcribe",
  signedIn = false,
}: {
  initialTab?: string;
  signedIn?: boolean;
}) {
  const router = useRouter();
  const safeTab = TABS.some((t) => t.id === initialTab) ? initialTab : "transcribe";
  const [tab, setTab] = useState<TabId>(safeTab as TabId);
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
      goToTab("analyze");
    }
  }

  function goToTab(id: TabId) {
    setTab(id);
    router.replace(`/?tab=${id}`, { scroll: false });
  }

  async function signIn() {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: AUTH_CALLBACK_URL },
    });
  }

  function signOut() {
    supabase?.auth.signOut();
    window.location.reload();
  }

  return (
    <div className="page">
      <header className="topbar" style={{ justifyContent: "space-between" }}>
        <div className="brand">
          <span className="brand-dot" />
          Music Studio
        </div>
        <nav className="nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`nav-item${tab === t.id ? " active" : ""}`}
              onClick={() => goToTab(t.id)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
        <div className="account">
          {signedIn ? (
            <button className="btn btn-ghost" onClick={signOut}>
              Sign out
            </button>
          ) : (
            <button className="btn btn-ghost" id="signInBtn" onClick={signIn}>
              Sign in
            </button>
          )}
        </div>
      </header>

      <div className="workbench">
        {tab === "library" && (
          <Library signedIn={signedIn} onSignIn={signIn} />
        )}

        {tab === "transcribe" && (
          <Transcribe
            signedIn={signedIn}
            onTranscribed={onTranscribed}
            onGoToAnalyze={() => goToTab("analyze")}
            onAnalyze={handleAnalyze}
          />
        )}

        {tab === "analyze" && (
          <div className="card">
            <h3 className="card-title"><span className="glyph">📊</span> Analyze</h3>
            {analyzeStatus && <p className="status" style={{ marginBottom: 12 }}>{analyzeStatus}</p>}
            {analysisError && (
              <div className="card" style={{ borderColor: "rgba(239,68,68,0.3)", marginBottom: 12 }}>
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
        )}
      </div>

      <div className="footer">basic-pitch · FluidSynth · abcjs · Supabase</div>

      <div className="toast" id="toast" />
    </div>
  );
}
