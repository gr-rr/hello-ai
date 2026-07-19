"use client";

import { useEffect, useRef, useState } from "react";
import abcjs from "abcjs";
import type { TranscribeResult } from "@/lib/music";
import { midiNotesToAbc } from "@/lib/abc";

type Note = TranscribeResult["notes"][number];

const SOUNDFONT_URL =
  "https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/";

export default function Score({
  notes,
  analysis,
}: {
  notes: Note[];
  analysis?: TranscribeResult["analysis"];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  const cursorControlRef = useRef<abcjs.CursorControl | null>(null);
  const synthControlRef = useRef<abcjs.SynthObjectController | null>(null);
  const visualObjRef = useRef<abcjs.TuneObject | null>(null);

  const [ready, setReady] = useState(false);
  const [abc, setAbc] = useState("");

  const hasAnalysis = !!(analysis?.key && analysis?.tempo);

  useEffect(() => {
    if (!hasAnalysis || !containerRef.current) return;
    let cancelled = false;
    const generated = midiNotesToAbc(notes, {
      bpm: analysis!.tempo.bpm,
      key: { tonic: analysis!.key.tonic, mode: analysis!.key.mode },
      timeSignature: {
        numerator: analysis!.time_signature.numerator,
        denominator: analysis!.time_signature.denominator,
      },
    });
    setAbc(generated);

    const Cursor = class implements abcjs.CursorControl {
      onStart() {}
      onFinished() {
        if (containerRef.current)
          containerRef.current
            .querySelectorAll(".abcjs-cursor")
            .forEach((n) => ((n as HTMLElement).style.display = "none"));
      }
      onBeat() {}
      onEvent(ev: abcjs.NoteTimingEvent) {
        const svg = containerRef.current?.querySelector("svg");
        if (!svg || !ev.elements?.[0]?.length) return;
        const el = ev.elements[0][0] as unknown as SVGGraphicsElement;
        // hide all note highlights, show the active one
        svg.querySelectorAll(".abcjs-cursor").forEach((n) => n.remove());
        const h = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        const b = el.getBBox();
        h.setAttribute("x", `${b.x - 2}`);
        h.setAttribute("y", `${b.y - 2}`);
        h.setAttribute("width", `${b.width + 4}`);
        h.setAttribute("height", `${b.height + 4}`);
        h.setAttribute("class", "abcjs-cursor");
        svg.appendChild(h);
      }
    };

    cursorControlRef.current = new Cursor();

    const visualObj = abcjs.renderAbc(containerRef.current, generated, {
      responsive: "resize",
      add_classes: true,
      paddingtop: 8,
      paddingbottom: 8,
      paddingleft: 12,
      paddingright: 12,
    })[0];
    visualObjRef.current = visualObj;

    const synth = new abcjs.synth.SynthController();
    synthControlRef.current = synth;
    if (audioRef.current) {
      synth.load(
        audioRef.current,
        cursorControlRef.current,
        {
        displayLoop: false,
        displayRestart: false,
        displayPlay: true,
        displayProgress: true,
        displayWarp: false,
      },
      );
    }

    const setup = async () => {
      try {
        await synth.setTune(visualObj, false, {
          soundFontUrl: SOUNDFONT_URL,
        });
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setReady(false);
      }
    };
    setup();

    return () => {
      cancelled = true;
      const synth = synthControlRef.current as
        | (abcjs.SynthObjectController & { destroy?: () => void })
        | null;
      try {
        synth?.destroy?.();
      } catch {
        /* already torn down */
      }
      synthControlRef.current = null;
    };
  }, [notes, hasAnalysis, analysis]);

  const downloadAbc = () => {
    const blob = new Blob([abc], { type: "text/vnd.abc" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcription.abc";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!hasAnalysis) {
    return <p className="muted">Transcribe and analyze your audio to see the score.</p>;
  }

  return (
    <div className="score">
      <div className="score-controls">
        <button className="btn" disabled={!ready} onClick={() => synthControlRef.current?.play()}>
          ▶ Play
        </button>
        <button className="btn" disabled={!ready} onClick={() => synthControlRef.current?.pause()}>
          ⏸ Pause
        </button>
        <button className="btn" disabled={!ready} onClick={() => synthControlRef.current?.restart()}>
          ⏹ Stop
        </button>
        <button className="btn" disabled={!abc} onClick={downloadAbc}>
          ⬇ ABC
        </button>
      </div>
      <div ref={containerRef} className="score-abc" />
      <div ref={audioRef} className="score-audio" />
    </div>
  );
}
