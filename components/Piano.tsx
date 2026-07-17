"use client";

import { useEffect, useRef } from "react";

type Note = { note: string; freq: number; key: string; type: "white" | "black" };

const NOTES: Note[] = [
  { note: "C4", freq: 261.63, key: "a", type: "white" },
  { note: "C#4", freq: 277.18, key: "w", type: "black" },
  { note: "D4", freq: 293.66, key: "s", type: "white" },
  { note: "D#4", freq: 311.13, key: "e", type: "black" },
  { note: "E4", freq: 329.63, key: "d", type: "white" },
  { note: "F4", freq: 349.23, key: "f", type: "white" },
  { note: "F#4", freq: 369.99, key: "t", type: "black" },
  { note: "G4", freq: 392.0, key: "g", type: "white" },
  { note: "G#4", freq: 415.3, key: "y", type: "black" },
  { note: "A4", freq: 440.0, key: "h", type: "white" },
  { note: "A#4", freq: 466.16, key: "u", type: "black" },
  { note: "B4", freq: 493.88, key: "j", type: "white" },
  { note: "C5", freq: 523.25, key: "k", type: "white" },
];

const WHITE_COUNT = NOTES.filter((n) => n.type === "white").length;
const WHITE_WIDTH = 100 / WHITE_COUNT;
const BLACK_WIDTH = WHITE_WIDTH * 0.6;
const BLACK_HALF = BLACK_WIDTH / 2;

export default function Piano() {
  const pianoRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const activeRef = useRef<Map<string, OscillatorNode>>(new Map());

  function getCtx(): AudioContext {
    if (!ctxRef.current) {
      const Ctx =
        window.AudioContext || (window as any).webkitAudioContext;
      ctxRef.current = new Ctx();
    }
    return ctxRef.current;
  }

  function unlock() {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    // Play a silent buffer to unlock mobile audio.
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  }

  function playNote(note: Note) {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = "triangle";
    osc.frequency.value = note.freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.5);
    activeRef.current.set(note.note, osc);
  }

  function stopNote(note: Note) {
    const osc = activeRef.current.get(note.note);
    if (!osc) return;
    try {
      osc.stop();
    } catch {
      /* already stopped */
    }
    activeRef.current.delete(note.note);
  }

  useEffect(() => {
    const piano = pianoRef.current;
    if (!piano) return;
    let whiteIndex = 0;
    const keyByChar = new Map<string, { note: Note; el: HTMLButtonElement }>();

    NOTES.forEach((note) => {
      const el = document.createElement("button");
      el.className = `key key--${note.type}`;
      el.dataset.note = note.note;
      el.setAttribute("aria-label", `${note.note} (key ${note.key.toUpperCase()})`);
      el.innerHTML = `<span class="key__label">${note.key.toUpperCase()}</span>`;
      if (note.type === "white") {
        whiteIndex += 1;
      } else {
        el.style.left = `${whiteIndex * WHITE_WIDTH - BLACK_HALF}%`;
        el.style.width = `${BLACK_WIDTH}%`;
      }
      const press = (e: Event) => {
        e.preventDefault();
        unlock();
        el.classList.add("key--active");
        playNote(note);
      };
      const release = () => {
        el.classList.remove("key--active");
        stopNote(note);
      };
      el.addEventListener("pointerdown", press);
      el.addEventListener("pointerup", release);
      el.addEventListener("pointerleave", release);
      el.addEventListener("pointercancel", release);
      piano.appendChild(el);
      keyByChar.set(note.key, { note, el });
    });

    const pressed = new Set<string>();
    const onDown = (e: KeyboardEvent) => {
      const entry = keyByChar.get(e.key.toLowerCase());
      if (!entry || pressed.has(entry.note.note)) return;
      pressed.add(entry.note.note);
      unlock();
      entry.el.classList.add("key--active");
      playNote(entry.note);
    };
    const onUp = (e: KeyboardEvent) => {
      const entry = keyByChar.get(e.key.toLowerCase());
      if (!entry) return;
      pressed.delete(entry.note.note);
      entry.el.classList.remove("key--active");
      stopNote(entry.note);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    const unlockOnce = () => unlock();
    ["pointerdown", "touchstart", "keydown"].forEach((ev) =>
      window.addEventListener(ev, unlockOnce, { once: true })
    );

    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      piano.innerHTML = "";
      activeRef.current.forEach((o) => {
        try {
          o.stop();
        } catch {}
      });
      activeRef.current.clear();
    };
  }, []);

  return (
    <div className="piano-app">
      <div className="header">
        <span className="badge">Mini Piano</span>
        <h1>🎹 Play</h1>
        <p>Click the keys or use your keyboard (A–K, W/E/T/Y/U for sharps).</p>
      </div>
      <div className="piano" ref={pianoRef} />
      <p className="app__hint">
        Keys: <kbd>A</kbd> <kbd>W</kbd> <kbd>S</kbd> <kbd>E</kbd> <kbd>D</kbd>{" "}
        <kbd>F</kbd> <kbd>T</kbd> <kbd>G</kbd> <kbd>Y</kbd> <kbd>H</kbd> <kbd>U</kbd>{" "}
        <kbd>J</kbd> <kbd>K</kbd>
      </p>
    </div>
  );
}
