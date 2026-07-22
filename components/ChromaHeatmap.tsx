"use client";

import { useMemo } from "react";
import type { TranscribeResult } from "@/lib/music";
import { SHARP_NOTE_NAMES, computeChroma } from "@/lib/notes";

type Note = TranscribeResult["notes"][number];

const PC_LABELS = SHARP_NOTE_NAMES;
const BAR_W = 36;
const GAP = 4;
const MAX_H = 120;
const LABEL_H = 20;

export default function ChromaHeatmap({ notes }: { notes: Note[] }) {
  const chroma = useMemo(() => computeChroma(notes), [notes]);
  if (!notes.length) return null;

  const W = PC_LABELS.length * (BAR_W + GAP);

  return (
    <div className="viz-panel">
      <div className="section-label">Pitch class distribution</div>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${MAX_H + LABEL_H}`} width="100%" height={MAX_H + LABEL_H}>
          {chroma.map((val, i) => {
            const h = val * MAX_H;
            const x = i * (BAR_W + GAP);
            const y = MAX_H - h;
            const isBlack = [1, 3, 6, 8, 10].includes(i);
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={BAR_W}
                  height={h}
                  rx={4}
                  fill="var(--accent)"
                  opacity={isBlack ? 0.5 : 0.85}
                />
                <text
                  x={x + BAR_W / 2}
                  y={MAX_H + 14}
                  textAnchor="middle"
                  fill="var(--muted)"
                  fontSize={11}
                  fontFamily="var(--font-mono)"
                >
                  {PC_LABELS[i]}
                </text>
                <text
                  x={x + BAR_W / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fill="var(--muted)"
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                >
                  {Math.round(val * 100)}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
