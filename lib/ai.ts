import type { TranscribeResult } from "./music";

type TextGenerationPipeline = {
  (text: string, options?: Record<string, unknown>): Promise<
    { generated_text: string }[]
  >;
  dispose: () => Promise<void>;
};

let generatorPromise: Promise<TextGenerationPipeline> | null = null;
let generatorInstance: TextGenerationPipeline | null = null;

const MODEL_ID = "onnx-community/LFM2.5-350M-q4";
const MODEL_CACHE = "music-studio-ai-cache";

async function loadGenerator(): Promise<TextGenerationPipeline> {
  if (generatorInstance) return generatorInstance;
  if (generatorPromise) return generatorPromise;

  generatorPromise = (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = MODEL_CACHE;

    const pipe = (await pipeline("text-generation", MODEL_ID, {
      dtype: "q4",
    })) as unknown as TextGenerationPipeline;

    generatorInstance = pipe;
    return pipe;
  })();

  return generatorPromise;
}

export async function loadModel(): Promise<void> {
  await loadGenerator();
}

export function isModelLoaded(): boolean {
  return generatorInstance !== null;
}

export function formatAnalysisForPrompt(
  analysis: NonNullable<TranscribeResult["analysis"]>,
): string {
  const lines: string[] = [];

  lines.push(`Key: ${analysis.key.tonic} ${analysis.key.mode} (confidence: ${(analysis.key.confidence * 100).toFixed(0)}%)`);

  if (analysis.tempo) {
    lines.push(`Tempo: ${analysis.tempo.bpm} BPM (confidence: ${(analysis.tempo.confidence * 100).toFixed(0)}%)`);
  }

  if (analysis.time_signature) {
    lines.push(`Time signature: ${analysis.time_signature.numerator}/${analysis.time_signature.denominator}`);
  }

  if (analysis.chords?.length) {
    lines.push("");
    lines.push("Chord progression:");
    for (const c of analysis.chords) {
      const label = c.quality === "M" ? c.root : c.quality === "m" ? `${c.root}m` : `${c.root}${c.quality}`;
      lines.push(`  ${c.start.toFixed(1)}s–${c.end.toFixed(1)}s: ${label}`);
    }
  }

  if (analysis.roman_numerals?.length) {
    lines.push("");
    lines.push("Roman numerals:");
    const nums = analysis.roman_numerals.map((rn) => rn.figure).join(" - ");
    lines.push(`  ${nums}`);
  }

  if (analysis.cadences?.length) {
    lines.push("");
    lines.push("Cadences:");
    for (const c of analysis.cadences) {
      lines.push(`  ${c.type} at ${c.position.toFixed(1)}s (${c.chords.join(" → ")})`);
    }
  }

  if (analysis.modulations?.length) {
    lines.push("");
    lines.push("Modulations:");
    for (const m of analysis.modulations) {
      lines.push(`  ${m.from_key} → ${m.to_key} at ${m.position.toFixed(1)}s`);
    }
  }

  if (analysis.voice_leading) {
    const vl = analysis.voice_leading;
    lines.push("");
    lines.push("Voice leading:");
    lines.push(`  Contrary: ${(vl.contrary * 100).toFixed(0)}%, Parallel: ${(vl.parallel * 100).toFixed(0)}%, Oblique: ${(vl.oblique * 100).toFixed(0)}%, Similar: ${(vl.similar * 100).toFixed(0)}%`);
    lines.push(`  Summary: ${vl.motion_summary}`);
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are a music theory tutor embedded in a music analysis app. You explain musical analysis in plain language. Be educational but accessible. Cite specific measures or timestamps when referencing events. Use Roman numeral analysis terminology. Keep explanations concise (2-4 paragraphs max). Do not use markdown formatting — write in plain text.`;

export async function explainMusic(
  question: string,
  analysis: NonNullable<TranscribeResult["analysis"]>,
): Promise<string> {
  const generator = await loadGenerator();

  const analysisText = formatAnalysisForPrompt(analysis);

  const prompt = `${SYSTEM_PROMPT}

Here is the analysis of a piece of music:

${analysisText}

The user asks: "${question}"

Provide a clear, educational explanation:`;

  const output = await generator(prompt, {
    max_new_tokens: 512,
    temperature: 0.7,
    do_sample: true,
  });

  const text = output[0]?.generated_text ?? "";
  const answerStart = text.indexOf("Provide a clear");
  if (answerStart !== -1) {
    return text.slice(answerStart + "Provide a clear, educational explanation:".length).trim();
  }
  return text.slice(-512).trim();
}

export async function disposeModel(): Promise<void> {
  if (generatorInstance) {
    await generatorInstance.dispose();
    generatorInstance = null;
    generatorPromise = null;
  }
}
