"use client";

import { useEffect, useRef, useState } from "react";
import abcjs from "abcjs";
import type { TranscribeResult } from "@/lib/music";
import { midiNotesToAbc } from "@/lib/abc";

type Note = TranscribeResult["notes"][number];

export default function Score({ notes }: { notes: Note[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  const cursorControlRef = useRef<abcjs.CursorControl | null>(null);
  const synthControlRef = useRef<abcjs.SynthObjectController | null>(null);
  const visualObjRef = useRef<abcjs.TuneObject | null>(null);

  const [ready, setReady] = useState(false);
  const [abc, setAbc] = useState("");

  useEffect(() => {
    if (!containerRef.current) return;
    const generated = midiNotesToAbc(notes);
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
          soundFontUrl: "https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/",
        });
        setReady(true);
      } catch {
        setReady(false);
      }
    };
    setup();
  }, [notes]);

  const downloadAbc = () => {
    const blob = new Blob([abc], { type: "text/vnd.abc" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcription.abc";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="score">
      <div className="score-controls">
        <button
          disabled={!ready}
          onClick={() => synthControlRef.current?.play()}
        >
          ▶ Play
        </button>
        <button
          disabled={!ready}
          onClick={() => synthControlRef.current?.pause()}
        >
          ⏸ Pause
        </button>
        <button
          disabled={!ready}
          onClick={() => synthControlRef.current?.restart()}
        >
          ⏹ Stop
        </button>
        <button disabled={!abc} onClick={downloadAbc}>
          ⬇ ABC
        </button>
      </div>
      <div ref={containerRef} className="score-abc" />
      <div ref={audioRef} className="score-audio" />
    </div>
  );
}
