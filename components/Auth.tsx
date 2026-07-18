"use client";

import { useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";

export default function Auth() {
  const { user, loading, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!isSupabaseConfigured) {
    return (
      <div className="page" style={{ alignItems: "center", justifyContent: "center" }}>
        <div className="stage" style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
          <h2 className="gradient-text" style={{ fontSize: 22, margin: "0 0 8px" }}>Music AI Studio</h2>
          <p className="muted" style={{ marginBottom: 0 }}>Supabase not configured — running in dev mode.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page" style={{ alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="page" style={{ alignItems: "center", justifyContent: "center" }}>
        <div className="stage" style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--accent-soft)", margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>&#x2705;</div>
            <p style={{ margin: "0 0 4px", fontWeight: 500 }}>{user.email}</p>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Signed in</p>
          </div>
          <button className="btn" onClick={signOut} style={{ width: "100%" }}>
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      if (mode === "login") {
        const { error } = await supabase!.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase!.auth.signUp({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase!.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ alignItems: "center", justifyContent: "center" }}>
      <div className="stage" style={{ maxWidth: 400, width: "100%" }}>
        <h2 className="gradient-text" style={{ fontSize: 22, margin: "0 0 4px", textAlign: "center" }}>
          Music AI Studio
        </h2>
        <p className="muted" style={{ textAlign: "center", margin: "0 0 24px", fontSize: 14 }}>
          {mode === "login" ? "Sign in to your account" : "Create a new account"}
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              padding: "10px 14px", borderRadius: 8, background: "var(--panel-2)",
              color: "var(--text)", border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit", outline: "none",
            }}
            onFocus={(e) => (e.target.style.boxShadow = "var(--ring)")}
            onBlur={(e) => (e.target.style.boxShadow = "none")}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={{
              padding: "10px 14px", borderRadius: 8, background: "var(--panel-2)",
              color: "var(--text)", border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit", outline: "none",
            }}
            onFocus={(e) => (e.target.style.boxShadow = "var(--ring)")}
            onBlur={(e) => (e.target.style.boxShadow = "none")}
          />

          {error && (
            <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>
          )}

          <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
            {busy ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                {mode === "login" ? "Signing in\u2026" : "Creating account\u2026"}
              </span>
            ) : (
              mode === "login" ? "Sign In" : "Sign Up"
            )}
          </button>
        </form>

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span className="muted" style={{ fontSize: 12 }}>or</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        <button className="btn" onClick={signInWithGoogle} disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>

        <p style={{ textAlign: "center", margin: "16px 0 0", fontSize: 13 }}>
          <span className="muted">
            {mode === "login" ? "Don\u2019t have an account?" : "Already have an account?"}
          </span>{" "}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
            style={{ padding: 0, fontSize: 13, textDecoration: "underline", color: "var(--accent)", cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}
          >
            {mode === "login" ? "Sign Up" : "Sign In"}
          </button>
        </p>
      </div>
    </div>
  );
}
