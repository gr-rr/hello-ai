import { encodeWAV } from "./wav";

const MODEL_ID = "Xenova/musicgen-small";

let model: any = null;
let tokenizer: any = null;

function log(...args: any[]) {
  (self as any).postMessage({ type: "log", args });
}

async function init() {
  const T = await import("@huggingface/transformers");
  model = await T.MusicgenForConditionalGeneration.from_pretrained(MODEL_ID, {
    dtype: {
      text_encoder: "q8",
      decoder_model_merged: "q8",
      encodec_decode: "fp32",
    },
    device: "wasm",
    progress_callback: (data: any) => {
      if (data.status === "progress" && typeof data.progress === "number") {
        (self as any).postMessage({ type: "load-progress", progress: data.progress });
      }
    },
  } as any);
  tokenizer = await T.AutoTokenizer.from_pretrained(MODEL_ID);
  (self as any).postMessage({ type: "ready" });
}

async function generate(opts: {
  text: string;
  duration: number;
  guidanceScale: number;
  temperature: number;
}) {
  const { text, duration, guidanceScale, temperature } = opts;

  const maxLength = Math.min(
    Math.max(Math.floor(duration * 50) + 4, 1),
    model.generation_config?.max_length ?? 1500
  );

  const inputs = tokenizer(text);
  const audioValues = await model.generate({
    ...inputs,
    max_length: maxLength,
    guidance_scale: guidanceScale,
    temperature,
  });

  const samplingRate = model.config.audio_encoder.sampling_rate;
  const data = audioValues?.data as Float32Array | undefined;
  if (!data || data.length === 0) {
    (self as any).postMessage({
      type: "error",
      message: "Generation produced no audio. Try again.",
    });
    return;
  }
  const wav = encodeWAV(data, samplingRate);
  (self as any).postMessage({ type: "result", buffer: wav }, [wav]);
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  try {
    if (msg.type === "init") await init();
    else if (msg.type === "generate") await generate(msg);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? "unknown");
    log("worker error", err);
    (self as any).postMessage({ type: "error", message });
  }
};
