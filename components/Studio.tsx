"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Library from "./library";
import Transcribe from "./transcribe";
import Analysis from "./analyze";
import { analyzeAudio, listLibrary, listTranscriptions, type TranscribeResult, type LibFile, type Transcription } from "@/lib/music";
import { AUTH_CALLBACK_URL } from "@/lib/site";

const TABS = [
  { id: "library", label: "Library" },
  { id: "transcribe", label: "Transcribe" },
  { id: "analyze", label: "Analyze transcription" },
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
  const [pendingLibFile, setPendingLibFile] = useState<LibFile | null>(null);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (tab === "analyze") {
      listLibrary().then(setAnalyzeLibFiles).catch(() => {});
    }
    if (tab === "library" && signedIn) {
      listTranscriptions().then(setTranscriptions).catch(() => setTranscriptions([]));
    }
  }, [tab, signedIn]);

  function refreshTranscriptions() {
    if (signedIn) {
      listTranscriptions().then(setTranscriptions).catch(() => setTranscriptions([]));
      setRefreshKey((k) => k + 1);
    }
  }

  function onTranscribed(result: TranscribeResult, name: string) {
    setLastResult(result);
    setAudioName(name);
    setAnalysis(result.analysis ?? null);
    setAnalysisError("");
  }

  async function handleAnalyze(midiBase64?: string, name?: string, libraryPath?: string) {
    if (name) setAudioName(name);
    if (!midiBase64 && !libraryPath) {
      setAnalysisError("Load a track or pick one from your library first");
      goToTab("analyze");
      return;
    }
    if (analysis && audioName === name) {
      goToTab("analyze");
      return;
    }
    setAnalyzeStatus("Analyzing…");
    setAnalysisError("");
    try {
      const result = await analyzeAudio(midiBase64, libraryPath);
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
    setAudioName(item.name);
    await handleAnalyze(undefined, item.name, item.id);
  }

  function handleLibraryTranscribe(file: LibFile) {
    setPendingLibFile(file);
    goToTab("transcribe");
  }

  function handleLibraryAnalyze(file: LibFile) {
    goToTab("analyze");
    handleAnalyzeLibrary(file);
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
              {t.label}
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
          <Library
            signedIn={signedIn}
            onSignIn={signIn}
            onTranscribe={handleLibraryTranscribe}
            onAnalyze={handleLibraryAnalyze}
            transcriptions={transcriptions}
            refreshKey={refreshKey}
          />
        )}

        {tab === "transcribe" && (
          <Transcribe
            signedIn={signedIn}
            onTranscribed={onTranscribed}
            onGoToAnalyze={() => goToTab("analyze")}
            onAnalyze={handleAnalyze}
            libraryFileToLoad={pendingLibFile}
            onClearLibraryFile={() => setPendingLibFile(null)}
            onTranscriptionSaved={refreshTranscriptions}
          />
        )}

        {tab === "analyze" && (
          <div className="card">
            <h3 className="card-title"><span className="glyph">◈</span> Analyze transcription</h3>

            {!analysis && !analyzeStatus && (
              <div className="section-label">Select a transcribed track</div>
            )}

            {!analysis && !analyzeStatus && analyzeLibFiles.filter(f => f.notes?.length).length === 0 && (
              <p className="muted" style={{ textAlign: "center", margin: "var(--s-4) 0" }}>
                No transcribed tracks in your library — transcribe one first.
              </p>
            )}

            {!analysis && !analyzeStatus && analyzeLibFiles.filter(f => f.notes?.length).length > 0 && (
              <div style={{ display: "flex", gap: "var(--s-2)", marginBottom: "var(--s-4)" }}>
                <select
                  className="sel"
                  value=""
                  onChange={(e) => {
                    const file = analyzeLibFiles.find(f => f.id === e.target.value);
                    if (file) handleAnalyzeLibrary(file);
                  }}
                  style={{ flex: 1 }}
                >
                  <option value="">-- Pick a track --</option>
                  {analyzeLibFiles.filter(f => f.notes?.length).map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            )}

            {analyzeStatus && <p className="status" style={{ marginBottom: "var(--s-3)" }}>{analyzeStatus}</p>}

            {analysisError && !analysis && !analyzeStatus && (
              <div className="alert-danger" style={{ marginBottom: "var(--s-3)" }}>
                <p className="status" style={{ color: "var(--danger)", margin: 0 }}>⚠️ {analysisError}</p>
              </div>
            )}

            {analysis && (
              <>
                <Analysis
                  analysis={analysis}
                  notes={lastResult?.notes ?? []}
                  audioName={audioName}
                  numNotes={lastResult?.num_notes ?? 0}
                />
                <div className="toolbar" style={{ marginTop: "var(--s-4)" }}>
                  <button className="btn" onClick={() => { setAnalysis(null); setAnalysisError(""); listLibrary().then(setAnalyzeLibFiles).catch(() => {}); }}>
                    ← Analyze another track
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="toast" id="toast" />
    </div>
  );
}
