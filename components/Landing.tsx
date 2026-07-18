"use client";

import { useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

function GoogleButton() {
  const [error, setError] = useState("");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)", alignItems: "center" }}>
      <button
        className="btn btn-primary"
        style={{ width: "100%", maxWidth: 320, justifyContent: "center", padding: "12px 18px", fontSize: "var(--fs-base)" }}
        onClick={async () => {
          try {
            const { error } = await supabase!.auth.signInWithOAuth({
              provider: "google",
              options: {
                redirectTo:
                  typeof window !== "undefined"
                    ? `${window.location.origin}/auth/callback`
                    : undefined,
              },
            });
            if (error) setError(error.message);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Google sign-in failed");
          }
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Sign in with Google
      </button>
      {error && (
        <p style={{ color: "var(--danger)", fontSize: "var(--fs-sm)", margin: 0 }}>{error}</p>
      )}
    </div>
  );
}

export default function Landing() {
  return (
    <div
      className="page"
      style={{
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: "var(--s-5)",
        paddingTop: "var(--s-8)",
        paddingBottom: "var(--s-8)",
      }}
    >
      <div
        className="panel fade-in"
        style={{
          maxWidth: 560,
          width: "100%",
          padding: "var(--s-7) var(--s-6)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "var(--s-5)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <span className="badge">AI music toolkit</span>

        <h1
          className="gradient-text"
          style={{
            fontSize: "var(--fs-2xl)",
            fontWeight: "var(--fw-bold)",
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          Music AI Studio
        </h1>

        <p
          style={{
            margin: 0,
            color: "var(--muted)",
            fontSize: "var(--fs-md)",
            maxWidth: "48ch",
          }}
        >
          Transcribe audio into MIDI and sheet music, then analyze and fine-tune
          your sound — all in one place.
        </p>

        {isSupabaseConfigured ? (
          <GoogleButton />
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Supabase not configured — running in dev mode.
          </p>
        )}

        <p
          style={{
            margin: 0,
            color: "var(--muted)",
            fontSize: "var(--fs-xs)",
            maxWidth: "44ch",
          }}
        >
          Audio transcription, MIDI export, and sheet music become available once
          you sign in.
        </p>
      </div>

      <div className="footer">basic-pitch · FluidSynth · abcjs</div>
    </div>
  );
}
