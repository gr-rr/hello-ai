"use client";

import { useEffect, useRef, useState } from "react";
import Visualizer from "./Visualizer";

const EXAMPLES = [
  "80s pop track with bassy drums and synth",
  "90s rock song with loud guitars and heavy drums",
  "a light and cheerful EDM track, with syncopated drums, airy pads, strong emotions, bpm: 130",
  "a cheerful country song with acoustic guitars",
  "lofi slow bpm electro chill with organic samples",
];

function saveAudio(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = `musicgen-${Date.now()}.wav`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function MusicGen() {
  const [textInput, setTextInput] = useState(EXAMPLES[0]);
  const [status, setStatus] = useState("Loading model (~656MB)…");
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const [duration, setDuration] = useState(5);
  const [guidanceScale, setGuidanceScale] = useState(3);
  const [temperature, setTemperature] = useState(1);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    let cancelled = false;
    const worker = new Worker(
      new URL("./musicgen.worker.ts", import.meta.url)
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === "load-progress") {
        setProgress(msg.progress);
        setStatus(
          msg.progress >= 1
            ? "Finalizing model…"
            : `Loading model (${(msg.progress * 100).toFixed(0)}% of ~656MB)…`
        );
      } else if (msg.type === "ready") {
        if (cancelled) return;
        setReady(true);
        setStatus("Ready. Describe the music you want.");
      } else if (msg.type === "result") {
        const blob = new Blob([msg.buffer], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setStatus("Done!");
        setProgress(1);
        setBusy(false);
      } else if (msg.type === "error") {
        setStatus("⚠️ " + msg.message);
        setBusy(false);
      }
    };

    worker.postMessage({ type: "init" });

    return () => {
      cancelled = true;
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  async function generate() {
    const text = textInput.trim();
    if (!text || busy || !ready) return;

    setBusy(true);
    setAudioUrl(null);
    if (audioRef.current) audioRef.current.src = "";

    // Coarse progress while generation runs off the main thread (in the worker).
    const start = Date.now();
    const estMs = Math.max(4000, duration * 1000 * 2.5);
    const timer = setInterval(() => {
      const p = Math.min(0.95, (Date.now() - start) / estMs);
      setProgress(p);
      setStatus(`Generating (${(p * 100).toFixed(0)}%)…`);
    }, 500);

    const onResult = () => clearInterval(timer);
    workerRef.current?.addEventListener("message", onResult, { once: true });

    try {
      workerRef.current?.postMessage({
        type: "generate",
        text,
        duration,
        guidanceScale,
        temperature,
      });
    } catch (err) {
      clearInterval(timer);
      const msg = err instanceof Error ? err.message : String(err ?? "unknown");
      setStatus("⚠️ Generation error: " + msg);
      setBusy(false);
    }
  }

  return (
    <div className="studio">
      <input
        type="text"
        className="prompt"
        placeholder="Describe the music to generate…"
        value={textInput}
        onChange={(e) => setTextInput(e.target.value)}
      />

      <div className="examples">
        {EXAMPLES.map((ex, i) => (
          <button
            key={i}
            className="chip"
            onClick={() => setTextInput(ex)}
            disabled={busy}
          >
            {ex}
          </button>
        ))}
      </div>

      <div className="params">
        <div>
          <label>Duration</label>
          <input
            type="range"
            min={1}
            max={30}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            disabled={busy}
          />
          <span className="param-val">{duration}s</span>
        </div>
        <div>
          <label>Guidance</label>
          <input
            type="range"
            min={1}
            max={10}
            value={guidanceScale}
            onChange={(e) => setGuidanceScale(Number(e.target.value))}
            disabled={busy}
          />
          <span className="param-val">{guidanceScale}</span>
        </div>
        <div>
          <label>Temp</label>
          <input
            type="range"
            min={0.1}
            max={2}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            disabled={busy}
          />
          <span className="param-val">{temperature}</span>
        </div>
      </div>

      <button
        className="generate"
        onClick={generate}
        disabled={!ready || busy || !textInput.trim()}
      >
        {busy ? "Generating…" : "Generate Music"}
      </button>

      <div className="progress">
        <div
          className="progress-bar"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <div className="status">{status}</div>

      {audioUrl && (
        <div className="player">
          <audio ref={audioRef} controls src={audioUrl} />
          <button className="save" onClick={() => saveAudio(audioUrl!)}>
            Save .wav
          </button>
          <Visualizer audioRef={audioRef} />
        </div>
      )}
    </div>
  );
}
