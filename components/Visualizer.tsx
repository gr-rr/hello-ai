"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

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
    const bgColor = styles.getPropertyValue("--bg").trim() || "#080515";
    const accentColor = styles.getPropertyValue("--accent").trim() || "#c084fc";

    let cancelled = false;

    async function setup() {
      const audioEl = audio;
      if (!audioEl) return;
      const AudioCtx =
        window.AudioContext ||
        window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx: AudioContext = new AudioCtx();
      ctxRef.current = ctx;
      const source = ctx.createMediaElementSource(audioEl);
      sourceRef.current = source;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyser.connect(ctx.destination);

      // Browsers create the AudioContext suspended until a user gesture.
      // If it stays suspended, cross-origin audio routed through Web Audio is
      // silenced. Resume it on play so gallery/saved playback actually sounds.
      const resume = () => {
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
      };
      audioEl.addEventListener("play", resume);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        if (cancelled) return;
        rafRef.current = requestAnimationFrame(draw);
        analyser.getByteTimeDomainData(dataArray);

        const w = canvas!.width;
        const h = canvas!.height;
        canvasCtx!.fillStyle = bgColor;
        canvasCtx!.fillRect(0, 0, w, h);

        // Waveform
        canvasCtx!.lineWidth = 2;
        canvasCtx!.strokeStyle = accentColor;
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
          canvasCtx!.fillStyle = `hsl(${hue}, 80%, ${30 + mag * 40}%)`;
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
    };
  }, [audioRef]);

  return <canvas ref={canvasRef} className="visualizer" width={760} height={180} />;
}
