"use client";

import { useEffect, useRef } from "react";
import type { TranscribeResult } from "@/lib/music";

type Note = TranscribeResult["notes"][number];

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_COLORS: Record<string, string> = {
  C: "#3b82f6", "C#": "#8b5cf6", D: "#a855f7", "D#": "#d946ef",
  E: "#ec4899", F: "#f43f5e", "F#": "#f97316", G: "#f59e0b",
  "G#": "#eab308", A: "#10b981", "A#": "#06b6d4", B: "#6366f1",
};

function pitchToName(p: number): string {
  return `${NOTE_NAMES[((p % 12) + 12) % 12]}${Math.floor(p / 12) - 1}`;
}

function pitchOctave(p: number): number {
  return Math.floor(p / 12) - 1;
}

const PPQ = 16;

export default function PianoRoll({
  notes,
  bpm = 120,
  playheadTime = 0,
}: {
  notes: Note[];
  bpm?: number;
  playheadTime?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const endTime = sorted.reduce((t, n) => Math.max(t, n.end), 0);
  const totalBeats = (endTime / 60) * bpm;
  const totalPx = Math.max(totalBeats * PPQ, 300);

  const minPitch = Math.min(...notes.map((n) => n.pitch));
  const maxPitch = Math.max(...notes.map((n) => n.pitch));
  const pitchRange = Math.max(maxPitch - minPitch, 8);

  const rows: { pitch: number; label: string; notes: Note[] }[] = [];
  for (let p = maxPitch; p >= minPitch; p--) {
    const label = pitchToName(p);
    const n = notes.filter((n) => n.pitch === p);
    if (n.length > 0) rows.push({ pitch: p, label, notes: n });
  }

  const rowH = 20;
  const labelW = 40;
  const h = rows.length * rowH + 16;

  const playheadX = labelW + (playheadTime / 60) * bpm * PPQ;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof el.scrollTo !== "function") return;
    const viewLeft = el.scrollLeft;
    const viewRight = viewLeft + el.clientWidth;
    if (playheadX < viewLeft + 20 || playheadX > viewRight - 40) {
      el.scrollTo({ left: Math.max(0, playheadX - el.clientWidth / 2), behavior: "smooth" });
    }
  }, [playheadX]);

  if (!notes.length) return <p className="muted">No notes to display.</p>;

  return (
    <div className="piano-roll-container" data-testid="piano-roll">
      <div className="piano-roll-scroll" ref={scrollRef}>
        <svg width={labelW + totalPx} height={h} style={{ display: "block" }}>
          {/* beat grid lines */}
          {Array.from({ length: Math.floor(totalBeats) + 1 }, (_, i) => {
            const x = labelW + i * PPQ;
            const isMeasure = i % 4 === 0;
            return (
              <line
                key={i}
                x1={x}
                y1={0}
                x2={x}
                y2={h}
                stroke={isMeasure ? "var(--border-strong)" : "var(--border)"}
                strokeWidth={isMeasure ? 1.5 : 0.5}
              />
            );
          })}

          {/* playhead */}
          {playheadTime > 0 && playheadX <= labelW + totalPx && (
            <line
              x1={playheadX}
              y1={0}
              x2={playheadX}
              y2={h}
              stroke="var(--accent)"
              strokeWidth={2}
            />
          )}

          {/* note rows */}
          {rows.map((row, ri) => {
            const y = ri * rowH + 8;
            const nameBase = row.label.replace(/\d/, "");
            return (
              <g key={row.pitch}>
                <text
                  x={4}
                  y={y + 14}
                  fill="var(--muted)"
                  fontSize={10}
                  fontFamily="var(--font-mono)"
                >
                  {row.label}
                </text>
                {row.notes.map((n, ni) => {
                  const x = labelW + (n.start / 60) * bpm * PPQ;
                  const dur = n.end - n.start;
                  const w = Math.max((dur / 60) * bpm * PPQ, 4);
                  const color = NOTE_COLORS[nameBase] || "var(--accent)";
                  const active = playheadTime >= n.start && playheadTime <= n.end;
                  return (
                    <rect
                      key={ni}
                      x={x}
                      y={y + 2}
                      width={w}
                      height={14}
                      rx={3}
                      fill={color}
                      opacity={active ? 1 : 0.3 + (n.velocity / 127) * 0.6}
                    >
                      <title>{row.label} @ {n.start.toFixed(2)}s · vel {n.velocity}</title>
                    </rect>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="piano-roll-footer">
        <span className="muted">{notes.length} notes · {endTime.toFixed(1)}s</span>
        {playheadTime > 0 && (
          <span className="muted">{playheadTime.toFixed(1)}s</span>
        )}
      </div>
    </div>
  );
}
