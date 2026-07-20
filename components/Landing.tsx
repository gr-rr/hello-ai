"use client";

import { useRouter } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase";
import GoogleButton from "./GoogleButton";

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
          Transcribe audio into MIDI and a piano roll, then analyze and fine-tune
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
