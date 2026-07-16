import MusicGen from "@/components/MusicGen";

export default function Home() {
  return (
    <main className="page">
      <div className="header">
        <span className="badge">Browser · WebGPU · transformers.js</span>
        <h1>hello-ai · Music Studio</h1>
        <p>
          Generate music from a text description, entirely in your browser. No
          server, no API keys — the model runs locally on your GPU. Try the{" "}
          <a href="/chat">LLM chat</a> too.
        </p>
      </div>
      <MusicGen />
      <div className="footer">
        Powered by{" "}
        <a
          href="https://github.com/huggingface/transformers.js"
          target="_blank"
          rel="noreferrer"
        >
          transformers.js
        </a>{" "}
        and{" "}
        <a
          href="https://huggingface.co/facebook/musicgen-small"
          target="_blank"
          rel="noreferrer"
        >
          MusicGen
        </a>
        .
      </div>
    </main>
  );
}
