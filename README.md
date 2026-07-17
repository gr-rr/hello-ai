# hello-ai

A website that runs **local LLM inference in the browser** using
[transformers.js](https://github.com/huggingface/transformers.js) and WebGPU.
No server, no API keys — the model runs entirely on the client.

## Features

- 💬 Chat UI built with **Next.js + React**
- ⚡ Inference via **transformers.js** (WebGPU) — `Qwen2.5-0.5B-Instruct`
- 🔜 Planned: an **Unsloth** finetuning demo showing the training process

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000. The first load downloads the model weights
(~0.5B params, quantized) into the browser cache.

> Requires a WebGPU-capable browser (recent Chrome/Edge). Without WebGPU the
> model will fail to load.

## Deploy

Deploy to [Vercel](https://vercel.com) — connect the repo and it builds with
the included `vercel.json` (Next.js framework preset).

## Future: Unsloth finetuning

The roadmap includes a page that demonstrates fine-tuning with
[Unsloth](https://unsloth.ai) and visualizes the process (loss curve, adapter
export). Unsloth requires a local GPU environment, so that demo will run
server-side / locally rather than on Vercel's free tier.
