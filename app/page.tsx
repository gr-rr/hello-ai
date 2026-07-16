import Chat from "@/components/Chat";

export default function Home() {
  return (
    <main className="page">
      <div className="header">
        <span className="badge">Browser · WebGPU · transformers.js</span>
        <h1>hello-ai</h1>
        <p>
          Chat with a small language model running entirely in your browser.
          No server, no API keys. Future builds will add an Unsloth
          finetuning demo.
        </p>
      </div>
      <Chat />
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
        <a href="https://unsloth.ai" target="_blank" rel="noreferrer">
          Unsloth
        </a>{" "}
        (coming soon).
      </div>
    </main>
  );
}
