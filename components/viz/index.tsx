"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { listLibrary, type LibFile } from "@/lib/music";
import { loadLocalTranscription } from "@/lib/browser-store";
import PianoRoll from "@/components/PianoRoll";
import Spectrogram from "@/components/Spectrogram";
import ChromaHeatmap from "@/components/ChromaHeatmap";
import Tonnetz from "@/components/Tonnetz";
import Visualizer from "@/components/Visualizer";
import { useSharedAudio } from "@/lib/audio-context";

type VizMode = "piano-roll" | "spectrogram" | "chroma" | "tonnetz";
type PlaybackSource = "original" | "midi";

const VIZ_MODES: { id: VizMode; label: string }[] = [
  { id: "piano-roll", label: "Piano roll" },
  { id: "spectrogram", label: "Spectrogram" },
  { id: "chroma", label: "Chroma" },
  { id: "tonnetz", label: "Tonnetz" },
];

function synthMidi(notes: { pitch: number; start: number; end: number; velocity: number }[], onTime: (t: number) => void): () => void {
  const ctx = new AudioContext();
  let raf: number;
  let stopped = false;
  const startTime = ctx.currentTime + 0.05;

  const noteEvents: { time: number; pitch: number; dur: number; vel: number }[] = [];
  for (const n of notes) {
    noteEvents.push({ time: n.start, pitch: n.pitch, dur: Math.max(n.end - n.start, 0.01), vel: n.velocity / 127 });
  }
  noteEvents.sort((a, b) => a.time - b.time);

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.5;
  masterGain.connect(ctx.destination);

  const oscs: OscillatorNode[] = [];
  for (const ev of noteEvents) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 440 * Math.pow(2, (ev.pitch - 69) / 12);
    gain.gain.setValueAtTime(0, startTime + ev.time);
    gain.gain.linearRampToValueAtTime(ev.vel * 0.6, startTime + ev.time + 0.01);
    gain.gain.setValueAtTime(ev.vel * 0.6, startTime + ev.time + ev.dur * 0.7);
    gain.gain.linearRampToValueAtTime(0, startTime + ev.time + ev.dur);
    osc.connect(gain).connect(masterGain);
    osc.start(startTime + ev.time);
    osc.stop(startTime + ev.time + ev.dur + 0.01);
    oscs.push(osc);
  }

  const lastEnd = noteEvents.length > 0 ? Math.max(...noteEvents.map((e) => e.time + e.dur)) : 0;

  function tick() {
    if (stopped) return;
    const elapsed = ctx.currentTime - startTime;
    onTime(Math.min(elapsed, lastEnd));
    if (elapsed < lastEnd) {
      raf = requestAnimationFrame(tick);
    } else {
      onTime(0);
    }
  }
  raf = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    for (const o of oscs) {
      try { o.stop(); } catch {}
    }
    ctx.close();
  };
}

export default function Viz() {
  const [files, setFiles] = useState<LibFile[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [mode, setMode] = useState<VizMode>("piano-roll");
  const [playbackSource, setPlaybackSource] = useState<PlaybackSource>("original");
  const [midiTime, setMidiTime] = useState(0);
  const synthRef = useRef<(() => void) | null>(null);

  const { playing, currentTime, play, stop: sharedStop, audioRef } = useSharedAudio();

  useEffect(() => {
    listLibrary().then((lib) => {
      const local = loadLocalTranscription();
      if (local && local.notes.length > 0) {
        const localFile: LibFile = {
          name: local.name,
          url: local.audioDataUrl || "",
          id: "__local__",
          notes: local.notes,
          midi_base64: local.midi_base64,
        };
        setFiles([localFile, ...lib]);
      } else {
        setFiles(lib);
      }
    }).catch(() => {});
  }, []);

  const selected = files.find((f) => f.id === selectedId);
  const hasNotes = (selected?.notes?.length ?? 0) > 0;
  const isThisPlaying = playing === selectedId;

  const stopMidi = useCallback(() => {
    synthRef.current?.();
    synthRef.current = null;
    setMidiTime(0);
  }, []);

  const playOriginal = useCallback(() => {
    if (!selected) return;
    stopMidi();
    play(selected.id, selected.url);
  }, [selected, play, stopMidi]);

  const playMidi = useCallback(() => {
    if (!selected?.notes || selected.notes.length === 0) return;
    sharedStop();
    stopMidi();
    synthRef.current = synthMidi(selected.notes, setMidiTime);
  }, [selected, sharedStop, stopMidi]);

  const handleStop = useCallback(() => {
    stopMidi();
    sharedStop();
  }, [stopMidi, sharedStop]);

  const handlePlay = useCallback(() => {
    if (playbackSource === "midi") {
      if (synthRef.current) {
        stopMidi();
      } else {
        playMidi();
      }
    } else {
      if (isThisPlaying) {
        sharedStop();
      } else {
        playOriginal();
      }
    }
  }, [playbackSource, isThisPlaying, playOriginal, playMidi, stopMidi, sharedStop]);

  useEffect(() => {
    return () => { stopMidi(); };
  }, [stopMidi]);

  useEffect(() => {
    if (playing !== selectedId) {
      stopMidi();
    }
  }, [playing, selectedId, stopMidi]);

  const vizTime = playbackSource === "midi" ? midiTime : currentTime;

  return (
    <div className="card">
      <h3 className="card-title"><span className="glyph">◈</span> Visualize</h3>

      <div className="section-label">Select a track</div>
      <select
        className="sel"
        value={selectedId}
        onChange={(e) => {
          handleStop();
          setSelectedId(e.target.value);
          setPlaybackSource("original");
          setMode("piano-roll");
        }}
        style={{ width: "100%", marginBottom: "var(--s-3)" }}
      >
        <option value="">-- Pick a track --</option>
        {files.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>

      {selected && (
        <>
          <div style={{ display: "flex", gap: "var(--s-2)", marginBottom: "var(--s-3)", flexWrap: "wrap" }}>
            <button
              className={`chip${playbackSource === "original" ? "" : " ghost"}`}
              onClick={() => { handleStop(); setPlaybackSource("original"); }}
            >
              Original
            </button>
            {hasNotes && (
              <button
                className={`chip${playbackSource === "midi" ? "" : " ghost"}`}
                onClick={() => { handleStop(); setPlaybackSource("midi"); }}
              >
                MIDI
              </button>
            )}
          </div>

          <div className="section-label">Playback</div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", marginBottom: "var(--s-2)" }}>
            <button className="icon-btn" onClick={handlePlay}>
              {(playbackSource === "midi" ? synthRef.current : isThisPlaying) ? "⏸" : "▶"}
            </button>
            <span className="muted" style={{ fontFamily: "monospace", fontSize: "var(--fs-xs)" }}>
              {Math.floor(vizTime)}s
            </span>
          </div>
          {playbackSource === "original" && <Visualizer audioRef={audioRef} />}

          <div className="section-label">Visualization</div>
          <div style={{ display: "flex", gap: "var(--s-1)", marginBottom: "var(--s-3)", flexWrap: "wrap" }}>
            {VIZ_MODES.filter((m) => hasNotes || m.id === "spectrogram").map((m) => (
              <button
                key={m.id}
                className={`chip${mode === m.id ? "" : " ghost"}`}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === "piano-roll" && hasNotes && (
            <PianoRoll notes={selected.notes!} playheadTime={vizTime} bpm={120} />
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
