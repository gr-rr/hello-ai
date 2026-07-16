"use client";

import { useEffect, useRef, useState } from "react";
import Visualizer from "./Visualizer";

const MODEL_ID = "Xenova/musicgen-small";

const EXAMPLES = [
  "80s pop track with bassy drums and synth",
  "90s rock song with loud guitars and heavy drums",
  "a light and cheerful EDM track, with syncopated drums, airy pads, strong emotions, bpm: 130",
  "a cheerful country song with acoustic guitars",
  "lofi slow bpm electro chill with organic samples",
];

function encodeWAV(samples: Float32Array, sampleRate = 16000) {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // 16-bit PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

export default function MusicGen() {
  const [textInput, setTextInput] = useState(EXAMPLES[0]);
  const [status, setStatus] = useState("Loading model (~656MB)…");
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const [duration, setDuration] = useState(10);
  const [guidanceScale, setGuidanceScale] = useState(3);
  const [temperature, setTemperature] = useState(1);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const modelRef = useRef<any>(null);
  const tokenizerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const T = await import("@huggingface/transformers");

        setStatus("Loading model weights (~656MB, first run)…");

        modelRef.current =
          await T.MusicgenForConditionalGeneration.from_pretrained(MODEL_ID, {
            dtype: {
              text_encoder: "q8",
              decoder_model_merged: "q8",
              encodec_decode: "fp32",
            },
            device: "webgpu",
            progress_callback: (data: any) => {
              if (data.status !== "progress") return;
              if (typeof data.progress === "number") setProgress(data.progress);
            },
          } as any);

        tokenizerRef.current = await T.AutoTokenizer.from_pretrained(MODEL_ID);

        if (cancelled) return;
        setReady(true);
        setStatus("Ready. Describe the music you want.");
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

  async function generate() {
    const text = textInput.trim();
    if (!text || busy || !ready) return;

    setBusy(true);
    setAudioUrl(null);
    if (audioRef.current) audioRef.current.src = "";

    const model = modelRef.current;
    const tokenizer = tokenizerRef.current;

    const maxLength = Math.min(
      Math.max(Math.floor(duration * 50) + 4, 1),
      model.generation_config?.max_length ?? 1500
    );

    // Coarse progress while generation runs (no streamer to avoid
    // interfering with MusicGen's delay-pattern decoding).
    const start = Date.now();
    const estMs = duration * 1000 * 3; // rough heuristic for UI feedback
    const timer = setInterval(() => {
      const p = Math.min(0.95, (Date.now() - start) / estMs);
      setProgress(p);
      setStatus(`Generating (${(p * 100).toFixed(0)}%)…`);
    }, 500);

    try {
      const inputs = tokenizer(text);
      const audioValues = await model.generate({
        ...inputs,
        max_length: maxLength,
        guidance_scale: guidanceScale,
        temperature,
      });

      clearInterval(timer);

      const samplingRate = model.config.audio_encoder.sampling_rate;
      const data = audioValues?.data as Float32Array | undefined;
      console.log(
        "[MusicGen] audio_values dims:",
        audioValues?.dims,
        "type:",
        audioValues?.type,
        "dataLen:",
        data?.length,
        "samplingRate:",
        samplingRate
      );
      if (!data || data.length === 0) {
        setStatus("⚠️ Generation produced no audio. Try again.");
        return;
      }
      const wav = encodeWAV(data, samplingRate);
      const blob = new Blob([wav], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setStatus("Done!");
      setProgress(1);
    } catch (err) {
      clearInterval(timer);
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err ?? "unknown");
      setStatus("⚠️ Generation error: " + msg);
    } finally {
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
          <Visualizer audioRef={audioRef} />
        </div>
      )}
    </div>
  );
}
