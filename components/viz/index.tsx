"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { listLibrary, synthAudio, convertMusicFormat, type LibFile } from "@/lib/music";
import { loadLocalTranscription } from "@/lib/browser-store";
import PianoRoll from "@/components/PianoRoll";
import Spectrogram from "@/components/Spectrogram";
import ChromaHeatmap from "@/components/ChromaHeatmap";
import Tonnetz from "@/components/Tonnetz";
import Visualizer from "@/components/Visualizer";
import SheetMusic from "@/components/SheetMusic";
import { useSharedAudio } from "@/lib/audio-context";

type VizMode = "piano-roll" | "spectrogram" | "chroma" | "tonnetz" | "sheet-music";

const VIZ_MODES: { id: VizMode; label: string }[] = [
  { id: "piano-roll", label: "Piano roll" },
  { id: "spectrogram", label: "Spectrogram" },
  { id: "chroma", label: "Chroma" },
  { id: "tonnetz", label: "Tonnetz" },
  { id: "sheet-music", label: "Sheet Music" },
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
  const [midiTime, setMidiTime] = useState(0);
  const [musicXml, setMusicXml] = useState("");
  const [midiDuration, setMidiDuration] = useState(0);
  const midiIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const midiStartRef = useRef(0);
  const midiOffsetRef = useRef(0);
  const [wavUrl, setWavUrl] = useState<string | null>(null);
  const [synthLoading, setSynthLoading] = useState(false);

  const { playing, currentTime, duration, play, stop: sharedStop, audioRef } = useSharedAudio();

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
    if (midiIntervalRef.current) {
      clearInterval(midiIntervalRef.current);
      midiIntervalRef.current = null;
    }
    setMidiTime(0);
    midiOffsetRef.current = 0;
  }, []);

  const playMidiSynth = useCallback(async () => {
    if (!selected?.midi_base64) return;
    sharedStop();
    stopMidi();

    if (wavUrl) {
      play(selectedId, wavUrl);
      return;
    }

    setSynthLoading(true);
    try {
      const synth = await synthAudio(selected.midi_base64);
      const bytes = Uint8Array.from(atob(synth.wav_base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      setWavUrl(url);
      play(selectedId, url);
    } catch {
      // fallback: simple MIDI timer for visualizer
      const maxEnd = Math.max(...(selected.notes ?? []).map((n) => n.end));
      setMidiDuration(maxEnd);
      midiStartRef.current = performance.now();
      midiOffsetRef.current = 0;
      setMidiTime(0);
      midiIntervalRef.current = setInterval(() => {
        const elapsed = (performance.now() - midiStartRef.current) / 1000;
        setMidiTime(midiOffsetRef.current + elapsed);
      }, 50);
    } finally {
      setSynthLoading(false);
    }
  }, [selected, selectedId, wavUrl, play, sharedStop, stopMidi]);

  const handleStop = useCallback(() => {
    stopMidi();
    sharedStop();
  }, [stopMidi, sharedStop]);

  const handlePlay = useCallback(() => {
    if (isThisPlaying) {
      sharedStop();
      stopMidi();
    } else {
      playMidiSynth();
    }
  }, [isThisPlaying, playMidiSynth, sharedStop, stopMidi]);

  const handleSeek = useCallback((pct: number) => {
    const a = audioRef.current;
    if (a && duration > 0) a.currentTime = pct * duration;
  }, [audioRef, duration]);

  useEffect(() => {
    return () => {
      if (midiIntervalRef.current) clearInterval(midiIntervalRef.current);
      if (wavUrl) URL.revokeObjectURL(wavUrl);
    };
  }, []);

  useEffect(() => {
    if (onStopRef) {
      onStopRef.current = handleStop;
      return () => { onStopRef.current = null; };
    }
  }, [onStopRef, handleStop]);

  // Reset wavUrl when track changes
  useEffect(() => {
    setWavUrl(null);
    setMusicXml("");
    stopMidi();
  }, [selectedId]);

  // Load MusicXML for sheet-music viz mode
  useEffect(() => {
    if (mode === "sheet-music" && selected?.midi_base64 && !musicXml) {
      convertMusicFormat(selected.midi_base64, "midi", "musicxml")
        .then((converted) => setMusicXml(atob(converted.data_base64)))
        .catch(() => setMusicXml(""));
    }
  }, [mode, selected, musicXml]);

  // Calculate MIDI duration
  useEffect(() => {
    if (selected?.notes && selected.notes.length > 0) {
      const maxEnd = Math.max(...selected.notes.map((n) => n.end));
      setMidiDuration(maxEnd);
    }
  }, [selected]);

  const vizTime = currentTime;
  const totalDuration = duration || midiDuration;
  const currentPct = totalDuration > 0 ? (vizTime / totalDuration) * 100 : 0;

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
          <div className="section-label">Playback</div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", marginBottom: "var(--s-1)" }}>
            <button className="icon-btn" onClick={handlePlay} disabled={synthLoading}>
              {synthLoading ? "◌" : isThisPlaying ? "⏸" : "▶"}
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
          {selected.url && <Visualizer audioRef={audioRef} />}

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

          {mode === "sheet-music" && (
            <>
              {musicXml ? (
                <SheetMusic musicXml={musicXml} />
              ) : selected.midi_base64 ? (
                <div style={{ textAlign: "center", padding: "var(--s-4)", color: "var(--muted)", fontSize: "var(--fs-sm)" }}>
                  Loading sheet music…
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "var(--s-4)", color: "var(--muted)", fontSize: "var(--fs-sm)" }}>
                  No MIDI data available for sheet music.
                </div>
              )}
            </>
          )}
        </>
      )}

    </div>
  );
}
