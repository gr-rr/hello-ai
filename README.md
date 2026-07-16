# hello-ai · Music Studio

An in-browser **text-to-music** studio that runs entirely on the client using
[transformers.js](https://github.com/huggingface/transformers.js) and WebGPU.
No server, no API keys — the model runs locally on your GPU.

## Features

- 🎵 **Music Studio** (`/`) — text-to-music with **MusicGen** via transformers.js (WebGPU)
- ⚡ Inference via **transformers.js** (WebGPU): `Xenova/musicgen-small`
- 📊 Live **waveform + spectrogram** visualizer (native Web Audio `AnalyserNode`)

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

> Requires a WebGPU-capable browser (recent Chrome/Edge). Without WebGPU the
> model will fail to load.

### Headless WebGPU verification

`npm run debug` drives the live (or local) URL with headless Chromium using
SwiftShader WebGPU and prints console logs. Set `URL` to test another target:

```bash
URL=http://localhost:3000 npm run debug
```

## Deploy

Deploy to [Vercel](https://vercel.com) — connect the repo and it builds with
the included `vercel.json` (Next.js framework preset).

## ⚠️ License (important)

The music model is `Xenova/musicgen-small`, derived from Meta's
[`facebook/musicgen-small`](https://huggingface.co/facebook/musicgen-small),
which is released under **`cc-by-nc-4.0` (non-commercial)**. This demo is for
non-commercial experimentation only.

## Roadmap

- 🔜 Reference-audio **melody conditioning** (upload a clip to guide the melody)
- 🔜 Side-by-side **compare** of two generations
- 🔜 **ACE-Step** local mode (Python/MPS, commercial-friendly) + LoRA fine-tuning

