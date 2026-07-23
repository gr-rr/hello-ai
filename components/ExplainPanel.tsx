"use client";

import { useState, useRef, useEffect } from "react";
import { loadModel, isModelLoaded, explainMusic } from "@/lib/ai";
import type { TranscribeResult } from "@/lib/music";

type Message = { role: "user" | "assistant"; text: string };

const QUICK_PROMPTS = [
  "Explain the harmony of this piece",
  "Why does this key sound the way it does?",
  "What are the important cadences?",
  "Describe the overall form",
];

type Props = {
  analysis: NonNullable<TranscribeResult["analysis"]>;
};

export default function ExplainPanel({ analysis }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [modelStatus, setModelStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  async function ensureModel() {
    if (isModelLoaded()) {
      setModelStatus("ready");
      return true;
    }
    setModelStatus("loading");
    try {
      await loadModel();
      setModelStatus("ready");
      return true;
    } catch {
      setModelStatus("error");
      return false;
    }
  }

  async function ask(question: string) {
    if (!question.trim() || loading) return;

    const userMsg: Message = { role: "user", text: question.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const ready = await ensureModel();
    if (!ready) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Could not load the AI model. Please try again later." },
      ]);
      setLoading(false);
      return;
    }

    try {
      const answer = await explainMusic(question, analysis);
      setMessages((prev) => [...prev, { role: "assistant", text: answer }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Something went wrong generating the explanation." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(input);
  }

  return (
    <div style={{ marginTop: "var(--s-4)" }}>
      <div className="section-label">Ask about this piece</div>

      {modelStatus === "loading" && (
        <div className="card" style={{ marginBottom: "var(--s-3)", fontSize: "var(--fs-sm)", color: "var(--muted)" }}>
          Loading AI model in your browser (one-time ~300MB download)…
        </div>
      )}

      {modelStatus === "error" && (
        <div className="card" style={{ marginBottom: "var(--s-3)", fontSize: "var(--fs-sm)", color: "var(--danger)" }}>
          Failed to load AI model. Your browser may not support WebAssembly.
        </div>
      )}

      {messages.length === 0 && modelStatus !== "loading" && modelStatus !== "error" && (
        <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap", marginBottom: "var(--s-3)" }}>
          {QUICK_PROMPTS.map((q) => (
            <button key={q} className="chip" onClick={() => ask(q)}>
              {q}
            </button>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div
          ref={listRef}
          style={{
            maxHeight: 320,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-2)",
            marginBottom: "var(--s-3)",
          }}
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              className="card"
              style={{
                padding: "var(--s-3)",
                fontSize: "var(--fs-sm)",
                lineHeight: "var(--line-height-base)",
                borderColor: msg.role === "user" ? "var(--accent-soft)" : "var(--border)",
                background: msg.role === "user" ? "var(--accent-soft)" : "var(--panel)",
              }}
            >
              {msg.text}
            </div>
          ))}
          {loading && (
            <div className="card" style={{ padding: "var(--s-3)", fontSize: "var(--fs-sm)", color: "var(--muted)" }}>
              Thinking…
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "var(--s-2)" }}>
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about harmony, cadences, form…"
          disabled={loading}
          style={{ flex: 1 }}
        />
        <button className="btn" type="submit" disabled={loading || !input.trim()}>
          Ask
        </button>
      </form>
    </div>
  );
}
