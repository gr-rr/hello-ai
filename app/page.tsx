import MusicGen from "@/components/MusicGen";

export default function Home() {
  return (
    <main className="page">
      <div className="header">
        <span className="badge">Server-side · Oracle · MusicGen</span>
        <h1>hello-ai · Music Studio</h1>
        <p>
          Generate music from a text description on the Oracle backend, then save
          it to the Supabase gallery. Try the{" "}
          <a href="/chat">LLM chat</a>, or the{" "}
          <a href="/train">Finetune Lab</a>.
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
