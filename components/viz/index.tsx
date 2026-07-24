"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { listLibrary, convertMusicFormat, type LibFile } from "@/lib/music";
import { loadLocalTranscription } from "@/lib/browser-store";
import { synthMidi, type SynthHandle } from "@/lib/midi-synth";
import PianoRoll from "@/components/PianoRoll";
import Spectrogram from "@/components/Spectrogram";
import ChromaHeatmap from "@/components/ChromaHeatmap";
import Tonnetz from "@/components/Tonnetz";
import Visualizer from "@/components/Visualizer";
import SheetMusic from "@/components/SheetMusic";
import { useSharedAudio } from "@/lib/audio-context";

type VizMode = "piano-roll" | "spectrogram" | "chroma" | "tonnetz";
type PlaybackSource = "original" | "midi" | "sheet-music";

const VIZ_MODES: { id: VizMode; label: string }[] = [
  { id: "piano-roll", label: "Piano roll" },
  { id: "spectrogram", label: "Spectrogram" },
  { id: "chroma", label: "Chroma" },
  { id: "tonnetz", label: "Tonnetz" },
];

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Viz({
  initialTrackId,
  selectedId: selectedIdProp,
  onTrackSelected,
  onStopRef,
}: {
  initialTrackId?: string | null;
  selectedId?: string;
  onTrackSelected?: (id: string) => void;
  onStopRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const [files, setFiles] = useState<LibFile[]>([]);
  const [selectedIdLocal, setSelectedIdLocal] = useState<string>("");
  const selectedId = selectedIdProp ?? selectedIdLocal;
  const [mode, setMode] = useState<VizMode>("piano-roll");
  const [playbackSource, setPlaybackSource] = useState<PlaybackSource>("original");
  const [midiTime, setMidiTime] = useState(0);
  const [musicXml, setMusicXml] = useState("");
  const [midiDuration, setMidiDuration] = useState(0);
  const synthRef = useRef<SynthHandle | null>(null);
  const midiOffsetRef = useRef(0);

  const { playing, currentTime, duration, paused, play, pause, resume, stop: sharedStop, audioRef } = useSharedAudio();

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
      setSelectedIdLocal(initialTrackId);
      onTrackSelected?.(initialTrackId);
    }
  }, [initialTrackId, files, onTrackSelected]);

  const selected = files.find((f) => f.id === selectedId);
  const hasNotes = (selected?.notes?.length ?? 0) > 0;
  const isThisPlaying = playing === selectedId;

  const stopMidi = useCallback(() => {
    synthRef.current?.stop();
    synthRef.current = null;
    setMidiTime(0);
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
  }, [selected, sharedStop, stopMidi]);

  const handleStop = useCallback(() => {
    stopMidi();
    sharedStop();
  }, [stopMidi, sharedStop]);

  const handlePlay = useCallback(() => {
    if (playbackSource === "midi" || playbackSource === "sheet-music") {
      if (synthRef.current) {
        if (synthRef.current.isPaused) {
          synthRef.current.resume();
        } else {
          midiOffsetRef.current = midiTime;
          synthRef.current.pause();
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
  }, [playbackSource, isThisPlaying, midiTime, playOriginal, playMidi, sharedStop]);

  const handleSeek = useCallback((pct: number) => {
    if (playbackSource === "midi" || playbackSource === "sheet-music") {
      if (synthRef.current && !synthRef.current.isPaused) {
        synthRef.current.stop();
        midiOffsetRef.current = pct * midiDuration;
        synthRef.current = synthMidi(selected?.notes ?? [], setMidiTime, midiOffsetRef.current);
      } else {
        midiOffsetRef.current = pct * midiDuration;
        setMidiTime(midiOffsetRef.current);
      }
    } else {
      const a = audioRef.current;
      if (a && duration > 0) a.currentTime = pct * duration;
    }
  }, [playbackSource, midiDuration, selected, audioRef, duration]);

  useEffect(() => {
    return () => { stopMidi(); };
  }, [stopMidi]);

  useEffect(() => {
    if (onStopRef) {
      onStopRef.current = handleStop;
      return () => { onStopRef.current = null; };
    }
  }, [onStopRef, handleStop]);

  useEffect(() => {
    if (playing !== selectedId) {
      stopMidi();
    }
  }, [playing, selectedId, stopMidi]);

  // Load MusicXML when sheet-music source is selected
  useEffect(() => {
    if (playbackSource === "sheet-music" && selected?.midi_base64 && !musicXml) {
      convertMusicFormat(selected.midi_base64, "midi", "musicxml")
        .then((converted) => setMusicXml(atob(converted.data_base64)))
        .catch(() => setMusicXml(""));
    }
  }, [playbackSource, selected, musicXml]);

  // Calculate MIDI duration
  useEffect(() => {
    if (selected?.notes && selected.notes.length > 0) {
      const maxEnd = Math.max(...selected.notes.map((n) => n.end));
      setMidiDuration(maxEnd);
    }
  }, [selected]);

  // Reset musicXml when track changes
  useEffect(() => {
    setMusicXml("");
  }, [selectedId]);

  const vizTime = playbackSource === "midi" || playbackSource === "sheet-music" ? midiTime : currentTime;
  const totalDuration = playbackSource === "midi" || playbackSource === "sheet-music" ? midiDuration : duration;
  const currentPct = totalDuration > 0 ? (vizTime / totalDuration) * 100 : 0;
  const isMidiSource = playbackSource === "midi" || playbackSource === "sheet-music";
  const isPlaying = isMidiSource ? (synthRef.current && !synthRef.current.isPaused) : isThisPlaying;

  return (
    <div className="card">
      <h3 className="card-title"><span className="glyph">◈</span> Visualize</h3>

      <div className="section-label">Select a transcribed track</div>
      {files.filter((f) => (f.notes?.length ?? 0) > 0).length === 0 ? (
        <div className="empty">
          No transcribed tracks in your library — transcribe one first.
        </div>
      ) : (
        <select
          className="sel"
          value={selectedId}
          onChange={(e) => {
            handleStop();
            setSelectedIdLocal(e.target.value);
            onTrackSelected?.(e.target.value);
            setPlaybackSource("original");
            setMode("piano-roll");
          }}
          style={{ width: "100%", marginBottom: "var(--s-3)" }}
        >
          <option value="">-- Pick a track --</option>
          {files.filter((f) => (f.notes?.length ?? 0) > 0).map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      )}

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
            {hasNotes && selected.midi_base64 && (
              <button
                className={`chip${playbackSource === "sheet-music" ? "" : " ghost"}`}
                onClick={() => { handleStop(); setPlaybackSource("sheet-music"); }}
              >
                Sheet Music
              </button>
            )}
          </div>

          <div className="section-label">Playback</div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", marginBottom: "var(--s-1)" }}>
            <button className="icon-btn" onClick={handlePlay}>
              {isPlaying ? "⏸" : "▶"}
            </button>
            <div
              className="pb-track"
              style={{ flex: 1, height: 6 }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                handleSeek(Math.max(0, Math.min(1, pct)));
              }}
            >
              <div className="pb-fill" style={{ width: `${currentPct}%` }} />
            </div>
            <span className="muted" style={{ fontFamily: "monospace", fontSize: "var(--fs-xs)" }}>
              {formatTime(vizTime)} / {formatTime(totalDuration || 0)}
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

          {playbackSource === "sheet-music" && (
            <>
              <div className="section-label">Sheet Music</div>
              {musicXml ? (
                <SheetMusic musicXml={musicXml} />
              ) : selected.midi_base64 ? (
                <div style={{ textAlign: "center", padding: "var(--s-4)", color: "var(--muted)", fontSize: "var(--fs-sm)" }}>
                  Loading sheet music…
                </div>
              ) : null}
            </>
          )}
        </>
      )}

    </div>
  );
}
