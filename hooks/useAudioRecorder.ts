import { useRef, useState, useCallback, useEffect } from "react";

type RecorderState = "idle" | "recording";

export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Stop recording on unmount to prevent mic staying active
  useEffect(() => {
    return () => {
      if (mediaRef.current?.state === "recording") {
        mediaRef.current.stop();
      }
    };
  }, []);

  const start = useCallback(
    async (onStop: (blob: Blob, ext: string) => void) => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      mediaRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mimeType = rec.mimeType || "audio/webm";
        const ext = mimeType.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setState("idle");
        onStop(blob, ext);
      };
      rec.start();
      setState("recording");
    },
    [],
  );

  const stop = useCallback(() => {
    mediaRef.current?.stop();
  }, []);

  return { state, start, stop, isRecording: state === "recording" };
}
