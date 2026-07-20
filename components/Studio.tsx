"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Library from "./library";
import Transcribe from "./transcribe";
import Analysis from "./analyze";
import { analyzeAudio, listMidiFiles, blobToBase64, type TranscribeResult, type LibFile } from "@/lib/music";
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
  const [analyzeLibFiles, setAnalyzeLibFiles] = useState<LibFile[]>([]);
  const [showAnalyzeLibPicker, setShowAnalyzeLibPicker] = useState(false);

  useEffect(() => {
    if (tab === "analyze") {
      listMidiFiles().then(setAnalyzeLibFiles).catch(() => {});
    }
  }, [tab]);

  function onTranscribed(result: TranscribeResult, name: string) {
    setLastResult(result);
    setAudioName(name);
    setAnalysis(result.analysis ?? null);
    setAnalysisError("");
  }

  async function handleAnalyze(audioBase64?: string, midiBase64?: string, name?: string) {
    if (name) setAudioName(name);
    setAnalyzeStatus("Analyzing…");
    setAnalysisError("");
    try {
      const result = await analyzeAudio(audioBase64, midiBase64);
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

  async function handleAnalyzeLibrary(item: LibFile) {
    setShowAnalyzeLibPicker(false);
    setAudioName(item.name);
    setAnalyzeStatus("Downloading MIDI…");
    try {
      const res = await fetch(item.url);
      if (!res.ok) throw new Error(`download failed: ${res.status}`);
      const blob = await res.blob();
      const b64 = await blobToBase64(blob);
      await handleAnalyze(undefined, b64, item.name);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "download failed");
      setAnalyzeStatus("");
    }
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
            <Library signedIn={signedIn} />
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

            {analysisError && !analysis && !analyzeStatus && (
              <div className="card" style={{ borderColor: "var(--danger-border)", marginBottom: 12 }}>
                <p className="status" style={{ color: "var(--danger)", margin: 0 }}>⚠️ {analysisError}</p>
              </div>
            )}

            {!analysis && !analyzeStatus && !showAnalyzeLibPicker && (
              <div className="source-grid" style={{ marginBottom: 16 }}>
                <div
                  className={`source-card${analyzeLibFiles.length > 0 ? "" : " disabled"}`}
                  onClick={() => analyzeLibFiles.length > 0 && setShowAnalyzeLibPicker(true)}
                >
                  <span className="sc-icon">📁</span>
                  <span className="sc-label">From library</span>
                  <span className="sc-hint">
                    {analyzeLibFiles.length === 0 ? "No transcribed songs" : "Pick a track"}
                  </span>
                </div>
              </div>
            )}

            {showAnalyzeLibPicker && (
              <>
                <div className="section-label">Pick a saved track</div>
                {analyzeLibFiles.map((f) => (
                  <div key={f.id} className="track" style={{ cursor: "pointer" }} onClick={() => handleAnalyzeLibrary(f)}>
                    <div className="track-head">
                      <div className="track-name">{f.name}</div>
                      <div className="track-actions">
                        <span className="chip">Analyze</span>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="toolbar">
                  <button className="btn btn-ghost" onClick={() => setShowAnalyzeLibPicker(false)}>Back</button>
                </div>
              </>
            )}

            {analysis && (
              <Analysis
                analysis={analysis}
                notes={lastResult?.notes ?? []}
                audioName={audioName}
              />
            )}
          </div>
        )}
      </div>

      <div className="footer">basic-pitch · FluidSynth · abcjs · Supabase</div>

      <div className="toast" id="toast" />
    </div>
  );
}
