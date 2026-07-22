"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import SpectrogramPlugin from "wavesurfer.js/dist/plugins/spectrogram.esm.js";
import { withAlpha } from "@/lib/color";

export default function Spectrogram({
  url,
  height = 100,
}: {
  url: string;
  height?: number;
}) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const specRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    if (!waveformRef.current || !specRef.current || !url) return;
    if (wsRef.current) {
      wsRef.current.destroy();
      wsRef.current = null;
    }

    setLoadStatus("loading");

    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue("--accent").trim() || "#c084fc";
    const accentStrong = styles.getPropertyValue("--accent-strong").trim() || "#a855f7";

    const spectrogramEl = specRef.current!;
    const ws = WaveSurfer.create({
      container: waveformRef.current,
      height: 60,
      waveColor: withAlpha(accent, 0.35),
      progressColor: withAlpha(accent, 0.7),
      cursorColor: accentStrong,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      url,
      plugins: [
        SpectrogramPlugin.create({
          container: spectrogramEl,
          labels: true,
          height,
          fftSamples: 512,
          windowFunc: "hann",
        }),
      ],
    });
    wsRef.current = ws;

    ws.on("ready", () => setLoadStatus("ready"));
    ws.on("error", () => setLoadStatus("error"));

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [url, height]);

  return (
    <div>
      <div className="section-label">Spectrogram</div>
      <div
        ref={waveformRef}
        className="spectrogram"
        style={{ borderRadius: "var(--r-md) var(--r-md) 0 0", overflow: "hidden", background: "var(--panel-2)" }}
      />
      <div
        ref={specRef}
        className="spectrogram"
        style={{ borderRadius: "0 0 var(--r-md) var(--r-md)", overflow: "hidden", background: "var(--panel-2)" }}
      />
      {loadStatus === "loading" && <p className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 4 }}>Rendering spectrogram…</p>}
      {loadStatus === "error" && <p className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 4 }}>Spectrogram unavailable.</p>}
    </div>
  );
}
