"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { listLibrary, type LibFile } from "@/lib/music";
import { loadLocalTranscription } from "@/lib/browser-store";
import { synthMidi, type SynthHandle } from "@/lib/midi-synth";
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

export default function Viz({ initialTrackId, onTrackSelected }: { initialTrackId?: string | null; onTrackSelected?: () => void }) {
  const [files, setFiles] = useState<LibFile[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [mode, setMode] = useState<VizMode>("piano-roll");
  const [playbackSource, setPlaybackSource] = useState<PlaybackSource>("original");
  const [midiTime, setMidiTime] = useState(0);
  const [midiPaused, setMidiPaused] = useState(false);
  const synthRef = useRef<SynthHandle | null>(null);
  const midiOffsetRef = useRef(0);

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

  useEffect(() => {
    if (initialTrackId && files.length > 0) {
      setSelectedId(initialTrackId);
      onTrackSelected?.();
    }
  }, [initialTrackId, files, onTrackSelected]);

  const selected = files.find((f) => f.id === selectedId);
  const hasNotes = (selected?.notes?.length ?? 0) > 0;
  const isThisPlaying = playing === selectedId;

  const stopMidi = useCallback(() => {
    synthRef.current?.stop();
    synthRef.current = null;
    setMidiTime(0);
    setMidiPaused(false);
    midiOffsetRef.current = 0;
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
    synthRef.current = synthMidi(selected.notes, setMidiTime, midiOffsetRef.current);
    setMidiPaused(false);
  }, [selected, sharedStop, stopMidi]);

  const handleStop = useCallback(() => {
    stopMidi();
    sharedStop();
  }, [stopMidi, sharedStop]);

  const handlePlay = useCallback(() => {
    if (playbackSource === "midi") {
      if (synthRef.current) {
        if (midiPaused) {
          synthRef.current.resume();
          setMidiPaused(false);
        } else {
          midiOffsetRef.current = midiTime;
          synthRef.current.pause();
          setMidiPaused(true);
        }
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
  }, [playbackSource, isThisPlaying, midiPaused, midiTime, playOriginal, playMidi, sharedStop]);

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
              {(playbackSource === "midi" ? (synthRef.current && !midiPaused) : isThisPlaying) ? "⏸" : "▶"}
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
