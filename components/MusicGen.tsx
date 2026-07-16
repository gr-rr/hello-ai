"use client";

import { useEffect, useRef, useState } from "react";
import Visualizer from "./Visualizer";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { getTracks, saveTrack, type Track } from "@/lib/db";

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

function audioFromBase64(b64: string): { url: string; blob: Blob } {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "audio/wav" });
  return { url: URL.createObjectURL(blob), blob };
}

export default function MusicGen() {
  const [textInput, setTextInput] = useState(EXAMPLES[0]);
  const [status, setStatus] = useState("Loading model (~656MB)…");
  const [progress, setProgress] = useState(0);
  const [indeterminate, setIndeterminate] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const [duration, setDuration] = useState(5);
  const [guidanceScale, setGuidanceScale] = useState(3);
  const [temperature, setTemperature] = useState(1);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [tracks, setTracks] = useState<Track[]>([]);

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
        setAudioBlob(blob);
        setSaved(false);
        setStatus("Done!");
        setProgress(1);
        setIndeterminate(false);
        setBusy(false);
      } else if (msg.type === "error") {
        setStatus("⚠️ " + msg.message);
        setIndeterminate(false);
        setBusy(false);
      }
    };

    worker.postMessage({ type: "init" });

    if (isSupabaseConfigured) {
      getTracks().then(setTracks).catch(() => {});
    }

    return () => {
      cancelled = true;
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  async function saveToGallery() {
    if (!audioBlob || saving) return;
    setSaving(true);
    try {
      const url = await saveTrack({
        prompt: textInput.trim(),
        blob: audioBlob,
        duration,
        guidanceScale,
        temperature,
      });
      if (url) {
        setSaved(true);
        const refreshed = await getTracks();
        setTracks(refreshed);
        setStatus("Saved to gallery!");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? "unknown");
      setStatus("⚠️ Save failed: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    const text = textInput.trim();
    if (!text || busy || !ready) return;

    setBusy(true);
    setAudioUrl(null);
    if (audioRef.current) audioRef.current.src = "";
    setProgress(0);
    setIndeterminate(true);
    setStatus("Generating… (server-side on Oracle)");

    try {
      // Try the FastAPI backend (Oracle) first; fall back to in-browser WASM.
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          duration,
          guidance_scale: guidanceScale,
          temperature,
          upload: true,
        }),
      });
      if (!res.ok) throw new Error(`backend ${res.status}`);
      const data = await res.json();
      if (data.audio_base64) {
        const { url, blob } = audioFromBase64(data.audio_base64);
        setAudioUrl(url);
        setAudioBlob(blob);
        setSaved(false);
        setStatus("Done! (server-generated)");
        setProgress(1);
        setIndeterminate(false);
        setBusy(false);
        return;
      }
      if (data.audio_url) {
        // Server uploaded to Supabase; just play the URL (no local blob to save).
        setAudioUrl(data.audio_url);
        setAudioBlob(null);
        setSaved(true);
        setStatus("Done! (server-generated + saved)");
        setProgress(1);
        setIndeterminate(false);
        setBusy(false);
        // Refresh gallery.
        if (isSupabaseConfigured) getTracks().then(setTracks).catch(() => {});
        return;
      }
      throw new Error("no audio returned");
    } catch {
      // Fallback to in-browser WASM inference.
      setStatus("Generating… (in-browser, this can take 10–30s)");
      workerRef.current?.postMessage({
        type: "generate",
        text,
        duration,
        guidanceScale,
        temperature,
      });
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

      <div className={`progress${indeterminate ? " indeterminate" : ""}`}>
        <div
          className="progress-bar"
          style={{ width: indeterminate ? undefined : `${Math.round(progress * 100)}%` }}
        />
      </div>
      <div className="status">{status}</div>

      {audioUrl && (
        <div className="player">
          <audio ref={audioRef} controls src={audioUrl} />
          <div className="save-row">
            <button className="save" onClick={() => saveAudio(audioUrl!)}>
              Save .wav
            </button>
            {isSupabaseConfigured && (
              <button
                className="save"
                onClick={saveToGallery}
                disabled={saving || saved || !audioBlob}
              >
                {saved ? "Saved ✓" : saving ? "Saving…" : "Save to gallery"}
              </button>
            )}
          </div>
          <Visualizer audioRef={audioRef} />
        </div>
      )}

      {isSupabaseConfigured && tracks.length > 0 && (
        <div className="gallery">
          <h3>Gallery</h3>
          <ul>
            {tracks.map((t) => (
              <li key={t.id}>
                <audio controls src={supabaseAudioUrl(t.audio_path)} />
                <span className="gallery-prompt">{t.prompt}</span>
                <span className="gallery-meta">
                  {t.duration}s · g{t.guidance_scale} · t{t.temperature}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function supabaseAudioUrl(path: string): string {
  if (!supabase) return "";
  return supabase.storage.from("audio").getPublicUrl(path).data.publicUrl;
}
