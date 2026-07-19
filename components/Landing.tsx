"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { AUTH_CALLBACK_URL } from "@/lib/site";

function GoogleButton() {
  const [error, setError] = useState("");

  return (
    <button
      className="btn btn-primary"
      style={{ width: "100%", maxWidth: 320, justifyContent: "center", padding: "12px 18px", fontSize: "var(--fs-base)" }}
      onClick={async () => {
        try {
          const { error } = await supabase!.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: AUTH_CALLBACK_URL },
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
  );
}

const FEATURES = [
  { icon: "🎼", title: "Transcribe", body: "Turn any audio into MIDI and a piano roll with basic-pitch." },
  { icon: "📊", title: "Analyze", body: "Detect key, tempo, and time signature from your recording." },
  { icon: "🎹", title: "Library", body: "Keep your transcriptions and revisit them anytime." },
];

export default function Landing() {
  const router = useRouter();

  return (
    <div
      className="page"
      style={{
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: "var(--s-5)",
        paddingTop: "var(--s-7)",
        paddingBottom: "var(--s-7)",
      }}
    >
      <div
        className="panel fade-in"
        style={{
          maxWidth: 640,
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
            maxWidth: "52ch",
          }}
        >
          Transcribe audio into MIDI and sheet music, then analyze and fine-tune
          your sound — all in one place.
        </p>

        <button
          className="btn btn-primary"
          style={{ width: "100%", maxWidth: 320, justifyContent: "center", padding: "12px 18px", fontSize: "var(--fs-base)" }}
          onClick={() => router.push("/?tab=transcribe")}
        >
          Open Studio
        </button>

        {isSupabaseConfigured && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)", alignItems: "center" }}>
            <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>Want to save your work?</span>
            <GoogleButton />
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--s-4)",
          width: "100%",
          maxWidth: 640,
        }}
      >
        {FEATURES.map((f) => (
          <div key={f.title} className="panel" style={{ padding: "var(--s-4)", textAlign: "left" }}>
            <div style={{ fontSize: 22, marginBottom: "var(--s-2)" }}>{f.icon}</div>
            <h3 style={{ margin: "0 0 4px", fontSize: "var(--fs-md)" }}>{f.title}</h3>
            <p className="muted" style={{ margin: 0 }}>{f.body}</p>
          </div>
        ))}
      </div>

      <div className="footer">basic-pitch · FluidSynth · abcjs</div>
    </div>
  );
}
