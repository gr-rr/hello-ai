"use client";

import { useRef } from "react";
import type { TranscribeResult } from "@/lib/music";

type Note = TranscribeResult["notes"][number];

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function pitchToName(p: number): string {
  return `${NOTE_NAMES[((p % 12) + 12) % 12]}${Math.floor(p / 12) - 1}`;
}

function pitchColor(p: number): string {
  const hues = [0, 30, 60, 85, 140, 180, 210, 250, 290, 320, 345, 15];
  const idx = ((p % 12) + 12) % 12;
  return `hsl(${hues[idx]}, 65%, 50%)`;
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
  if (!notes.length) return <p className="muted">No notes to display.</p>;

  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const endTime = sorted.reduce((t, n) => Math.max(t, n.end), 0);
  const totalBeats = (endTime / 60) * bpm;
  const totalPx = Math.max(totalBeats * PPQ, 300);

  const minPitch = Math.min(...notes.map((n) => n.pitch));
  const maxPitch = Math.max(...notes.map((n) => n.pitch));

  const rows: { pitch: number; label: string; notes: Note[] }[] = [];
  for (let p = maxPitch; p >= minPitch; p--) {
    const label = pitchToName(p);
    const n = notes.filter((x) => x.pitch === p);
    if (n.length > 0) rows.push({ pitch: p, label, notes: n });
  }

  const rowH = 22;
  const labelW = 36;
  const topPad = 14;
  const h = rows.length * rowH + topPad;
  const W = labelW + totalPx;

  const playheadX = labelW + (playheadTime / 60) * bpm * PPQ;

  return (
    <div className="piano-roll-container" data-testid="piano-roll">
      <div className="piano-roll-scroll" ref={scrollRef}>
        <svg
          viewBox={`0 0 ${W} ${h}`}
          preserveAspectRatio="xMinYMin meet"
          width="100%"
          height={h}
          style={{ display: "block" }}
        >
          {/* left label gutter */}
          <rect x={0} y={0} width={labelW} height={h} fill="var(--panel-2)" />

          {/* row stripes */}
          {rows.map((row, ri) => (
            <rect
              key={`stripe-${row.pitch}`}
              x={labelW}
              y={ri * rowH + topPad}
              width={totalPx}
              height={rowH}
              fill={ri % 2 === 0 ? "var(--panel-2)" : "transparent"}
            />
          ))}

          {/* beat grid */}
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

          {/* note rows */}
          {rows.map((row, ri) => {
            const y = ri * rowH + topPad;
            return (
              <g key={row.pitch}>
                <text
                  x={4}
                  y={y + 15}
                  fill="var(--muted)"
                  fontSize={11}
                  fontFamily="var(--font-mono)"
                >
                  {row.label}
                </text>
                {row.notes.map((n, ni) => {
                  const x = labelW + (n.start / 60) * bpm * PPQ;
                  const dur = n.end - n.start;
                  const w = Math.max((dur / 60) * bpm * PPQ, 5);
                  const active = playheadTime >= n.start && playheadTime <= n.end;
                  const color = pitchColor(n.pitch);
                  return (
                    <rect
                      key={ni}
                      x={x}
                      y={y}
                      width={w}
                      height={14}
                      rx={4}
                      fill={color}
                      opacity={active ? 0.95 : 0.25 + (n.velocity / 127) * 0.45}
                      style={
                        active
                          ? { filter: `drop-shadow(0 0 5px ${color})` }
                          : undefined
                      }
                    >
                      <title>{row.label} @ {n.start.toFixed(2)}s · vel {n.velocity}</title>
                    </rect>
                  );
                })}
              </g>
            );
          })}

          {/* playhead */}
          {playheadTime > 0 && playheadX <= W && (
            <g>
              <line
                x1={playheadX}
                y1={0}
                x2={playheadX}
                y2={h}
                stroke="var(--accent-strong)"
                strokeWidth={1.5}
              />
              <polygon
                points={`${playheadX},0 ${playheadX + 6},${topPad - 4} ${playheadX},${topPad} ${playheadX - 6},${topPad - 4}`}
                fill="var(--accent-strong)"
              />
            </g>
          )}
        </svg>
      </div>
      <div className="piano-roll-footer">
        <span className="muted">{notes.length} notes · {endTime.toFixed(1)}s</span>
        {playheadTime > 0 && <span className="muted">{playheadTime.toFixed(1)}s</span>}
      </div>
    </div>
  );
}
