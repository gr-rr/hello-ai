"use client";

import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

// Small instruct model that runs in-browser via WebGPU.
const MODEL_ID = "onnx-community/Qwen2.5-0.5B-Instruct";

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Loading model…");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generatorRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const { pipeline, TextStreamer } = await import(
          "@huggingface/transformers"
        );
        setStatus("Loading model weights (first run downloads ~0.5B params)…");

        const generator = await pipeline("text-generation", MODEL_ID, {
          dtype: "q4",
          device: "webgpu",
          cache: false,
        } as any);

        if (cancelled) return;
        generatorRef.current = generator;
        setReady(true);
        setStatus("Ready. Ask anything.");
      } catch (err) {
        console.error(err);
        setStatus(
          "Failed to load model. Your browser may not support WebGPU, or you may be offline."
        );
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || busy || !ready) return;

    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setStatus("Generating…");

    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    try {
      const { TextStreamer } = await import("@huggingface/transformers");
      const generator = generatorRef.current!;

      const streamer = new TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (t: unknown) => {
          if (t == null) return;
          const piece = typeof t === "string" ? t : String(t);
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = {
              role: "assistant",
              content: copy[copy.length - 1].content + piece,
            };
            return copy;
          });
        },
      });

      await generator(next, {
        max_new_tokens: 256,
        do_sample: false,
        return_full_text: false,
        streamer,
      });

      setStatus("Ready.");
    } catch (err) {
      console.error(err);
      setMessages((m) => {
        const copy = [...m];
        const msg =
          err instanceof Error ? err.message : String(err ?? "unknown error");
        copy[copy.length - 1] = {
          role: "assistant",
          content: "⚠️ Generation error: " + msg,
        };
        return copy;
      });
      setStatus("Error during generation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat">
      <div className="messages">
        {messages.length === 0 && (
          <div className="msg assistant">
            Hi! I&apos;m a tiny model running locally in your browser. Ask me
            something.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.content}
            {busy && i === messages.length - 1 && m.role === "assistant" && (
              <span className="cursor">▋</span>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="status">{status}</div>

      <div className="controls">
        <textarea
          rows={2}
          placeholder={ready ? "Type a message…" : "Loading model…"}
          value={input}
          disabled={!ready || busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button onClick={send} disabled={!ready || busy || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
