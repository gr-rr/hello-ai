"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { listLibrary, type LibFile } from "@/lib/music";
import PianoRoll from "@/components/PianoRoll";
import Spectrogram from "@/components/Spectrogram";
import ChromaHeatmap from "@/components/ChromaHeatmap";
import Tonnetz from "@/components/Tonnetz";

type VizMode = "piano-roll" | "spectrogram" | "chroma" | "tonnetz";

const VIZ_MODES: { id: VizMode; label: string }[] = [
  { id: "piano-roll", label: "Piano roll" },
  { id: "spectrogram", label: "Spectrogram" },
  { id: "chroma", label: "Chroma" },
  { id: "tonnetz", label: "Tonnetz" },
];

export default function Viz() {
  const [files, setFiles] = useState<LibFile[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [mode, setMode] = useState<VizMode>("piano-roll");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    listLibrary().then(setFiles).catch(() => {});
  }, []);

  const selected = files.find((f) => f.id === selectedId);
  const hasNotes = (selected?.notes?.length ?? 0) > 0;

  const play = useCallback(() => {
    if (!selected) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = selected.url;
    audio.play().catch(() => {});
    setPlaying(true);
    setCurrentTime(0);
  }, [selected]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlaying(false);
    setCurrentTime(0);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onEnd = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  return (
    <div className="card">
      <h3 className="card-title"><span className="glyph">◈</span> Visualize</h3>

      <div className="section-label">Select a track</div>
      <select
        className="sel"
        value={selectedId}
        onChange={(e) => {
          stop();
          setSelectedId(e.target.value);
        }}
        style={{ width: "100%", marginBottom: "var(--s-3)" }}
      >
        <option value="">-- Pick a track --</option>
        {files.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}{f.notes && f.notes.length > 0 ? " ✓" : ""}
          </option>
        ))}
      </select>

      {selected && (
        <>
          <div className="section-label">Playback</div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", marginBottom: "var(--s-3)" }}>
            <button className="icon-btn" onClick={playing ? stop : play}>
              {playing ? "⏸" : "▶"}
            </button>
            <span className="muted" style={{ fontFamily: "monospace", fontSize: "var(--fs-xs)" }}>
              {Math.floor(currentTime)}s
            </span>
          </div>
          <audio ref={audioRef} crossOrigin="anonymous" style={{ display: "none" }} />

          <div className="section-label">Visualization</div>
          <div style={{ display: "flex", gap: "var(--s-1)", marginBottom: "var(--s-3)", flexWrap: "wrap" }}>
            {VIZ_MODES.map((m) => (
              (m.id !== "piano-roll" || hasNotes) && (
                <button
                  key={m.id}
                  className={`chip${mode === m.id ? "" : " ghost"}`}
                  onClick={() => setMode(m.id)}
                >
                  {m.label}
                </button>
              )
            ))}
          </div>

          {mode === "piano-roll" && hasNotes && (
            <PianoRoll notes={selected.notes!} playheadTime={currentTime} bpm={120} />
          )}

          {mode === "spectrogram" && selected.url && (
            <Spectrogram url={selected.url} />
          )}

          {mode === "chroma" && hasNotes && (
            <ChromaHeatmap notes={selected.notes!} />
          )}

          {mode === "tonnetz" && hasNotes && (
            <Tonnetz notes={selected.notes!} />
          )}
        </>
      )}

      {!selected && (
        <p className="muted" style={{ textAlign: "center", margin: "var(--s-4) 0" }}>
          Pick a track above to visualize it.
        </p>
      )}
    </div>
  );
}
