import { pipeline, TextStreamer } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/Qwen2.5-0.5B-Instruct";
const messages = [{ role: "user", content: "Hello, what is 2+2?" }];

let generator;
try {
  generator = await pipeline("text-generation", MODEL_ID, { dtype: "q4", device: "cpu" });
} catch (e) {
  console.error("LOAD ERROR:", e && e.stack ? e.stack : e);
  process.exit(0);
}

console.log("tokenizer type:", typeof generator.tokenizer);
console.log("generator type:", typeof generator);

const streamer = new TextStreamer(generator.tokenizer, {
  skip_prompt: true,
  skip_special_tokens: true,
  callback_function: (t) => { process.stdout.write(t); },
});

try {
  const out = await generator(messages, {
    max_new_tokens: 32,
    do_sample: false,
    return_full_text: false,
    streamer,
  });
  console.log("\nOUTPUT:", JSON.stringify(out).slice(0, 500));
} catch (e) {
  console.error("\nGEN ERROR:", e && e.stack ? e.stack : e);
}
