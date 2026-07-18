"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Auth from "@/components/Auth";
import Studio from "@/components/Studio";
import Transcribe from "@/components/transcribe";

const BYPASS_AUTH =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_MOCK_ENABLED === "true";

function HomeInner() {
  const { user, loading } = useAuth();
  const params = useSearchParams();
  const tab = params.get("tab") || undefined;
  const [showAuth, setShowAuth] = useState(false);

  if (loading) {
    return (
      <div className="page" style={{ alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!BYPASS_AUTH && !user) {
    if (showAuth) return <Auth />;
    return (
      <div className="page" style={{ position: "relative" }}>
        <div style={{ position: "absolute", top: 16, right: 16, zIndex: 10 }}>
          <button className="btn" onClick={() => setShowAuth(true)}>
            Sign In
          </button>
        </div>
        <div className="app-grid">
          <div className="stage">
            <Transcribe compact />
          </div>
        </div>
        <div className="footer" style={{ marginTop: 48 }}>basic-pitch · FluidSynth · abcjs</div>
      </div>
    );
  }

  return <Studio initialTab={tab} />;
}

export default function HomeClient() {
  return (
    <Suspense
      fallback={
        <div className="page" style={{ alignItems: "center", justifyContent: "center" }}>
          <div className="spinner" />
        </div>
      }
    >
      <HomeInner />
    </Suspense>
  );
}
