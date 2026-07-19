"use client";

import { useEffect, useRef } from "react";

type Props = {
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
};

export default function Visualizer({ audioRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio) return;
    const canvasCtx = canvas.getContext("2d");
    if (!canvasCtx) return;

    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue("--accent").trim() || "#c084fc";
    const bg = styles.getPropertyValue("--bg").trim() || "#0b0d12";
    const withAlpha = (hex: string, alpha: number) => {
      const m = /^#([0-9a-f]{6})$/i.exec(hex);
      if (!m) return hex;
      const n = parseInt(m[1], 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
    };

    let cancelled = false;

    // Browsers create the AudioContext suspended until a user gesture.
    // If it stays suspended, cross-origin audio routed through Web Audio is
    // silenced. Resume it on play so gallery/saved playback actually sounds.
    const resume = () => {
      if (ctxRef.current?.state === "suspended") ctxRef.current.resume().catch(() => {});
    };

    async function setup() {
      const audioEl = audio;
      if (!audioEl) return;
      const AudioCtx =
        window.AudioContext ||
        (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx: AudioContext = new AudioCtx();
      ctxRef.current = ctx;
      const source = ctx.createMediaElementSource(audioEl);
      sourceRef.current = source;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyser.connect(ctx.destination);

      audioEl.addEventListener("play", resume);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        if (cancelled) return;
        rafRef.current = requestAnimationFrame(draw);
        analyser.getByteTimeDomainData(dataArray);

        const w = canvas!.width;
        const h = canvas!.height;
        canvasCtx!.fillStyle = bg;
        canvasCtx!.fillRect(0, 0, w, h);

        // Waveform
        canvasCtx!.lineWidth = 2;
        canvasCtx!.strokeStyle = accent;
        canvasCtx!.beginPath();
        const sliceWidth = w / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * h) / 2;
          if (i === 0) canvasCtx!.moveTo(x, y);
          else canvasCtx!.lineTo(x, y);
          x += sliceWidth;
        }
        canvasCtx!.lineTo(w, h / 2);
        canvasCtx!.stroke();

        // Spectrogram strip (bottom)
        const specH = Math.floor(h * 0.32);
        const y0 = h - specH;
        analyser.getByteFrequencyData(dataArray);
        const bars = 64;
        const barW = w / bars;
        for (let i = 0; i < bars; i++) {
          const idx = Math.floor((i / bars) * bufferLength);
          const mag = dataArray[idx] / 255;
          const barH = mag * specH;
          const hue = 220 - mag * 160;
          canvasCtx!.fillStyle = withAlpha(accent, 0.3 + mag * 0.6);
          canvasCtx!.fillRect(i * barW, y0 + (specH - barH), barW - 1, barH);
        }
      };
      draw();
    }

    setup();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      sourceRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
      audio.removeEventListener("play", resume);
    };
  }, [audioRef]);

  return <canvas ref={canvasRef} className="visualizer" width={760} height={180} />;
}
