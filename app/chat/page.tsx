import Chat from "@/components/Chat";

export default function ChatPage() {
  return (
    <main className="page">
      <div className="header">
        <span className="badge">Browser · WebGPU · transformers.js</span>
        <h1>hello-ai · Chat</h1>
        <p>
          A small language model running entirely in your browser. No server, no
          API keys. Back to the{" "}
          <a href="/">Music Studio</a>.
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
        </a>
        .
      </div>
    </main>
  );
}
