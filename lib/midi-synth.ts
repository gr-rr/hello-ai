import Soundfont from "soundfont-player";

export type SynthHandle = {
  stop: () => void;
  pause: () => void;
  resume: () => void;
  isPaused: boolean;
};

let cachedPiano: Soundfont.Player | null = null;
let pianoPromise: Promise<Soundfont.Player> | null = null;

async function getPiano(): Promise<Soundfont.Player> {
  if (cachedPiano) return cachedPiano;
  if (pianoPromise) return pianoPromise;

  pianoPromise = (async () => {
    const ctx = new AudioContext();
    const player = await Soundfont.instrument(ctx, "acoustic_grand_piano", {
      soundfont: "FluidR3_GM",
    });
    cachedPiano = player;
    return player;
  })();

  return pianoPromise;
}

export function synthMidi(
  notes: { pitch: number; start: number; end: number; velocity: number }[],
  onTime: (t: number) => void,
  offset = 0,
): SynthHandle {
  let stopped = false;
  let paused = false;
  let baseTime = offset;
  let startedAt = 0;
  let raf: number;
  let activeNotes: { stop: () => void }[] = [];

  const noteEvents = notes
    .map((n) => ({ time: n.start, pitch: n.pitch, dur: Math.max(n.end - n.start, 0.01), vel: n.velocity / 127 }))
    .sort((a, b) => a.time - b.time);

  const lastEnd = noteEvents.length > 0 ? Math.max(...noteEvents.map((e) => e.time + e.dur)) : 0;

  async function startPlayback() {
    const piano = await getPiano();
    if (stopped || paused) return;

    startedAt = performance.now() / 1000 - baseTime;

    for (const ev of noteEvents) {
      if (stopped || paused) break;
      if (ev.time + ev.dur < baseTime) continue;

      const delay = Math.max(0, ev.time - baseTime);
      const durationSec = ev.dur;

      const note = piano.play(
        pitchToNoteName(ev.pitch),
        delay,
        { duration: durationSec, gain: ev.vel * 0.7 },
      );
      activeNotes.push(note);
    }

    function tick() {
      if (stopped || paused) return;
      const elapsed = performance.now() / 1000 - startedAt;
      const t = Math.min(elapsed, lastEnd);
      onTime(t);
      if (t < lastEnd) {
        raf = requestAnimationFrame(tick);
      } else {
        onTime(0);
      }
    }
    raf = requestAnimationFrame(tick);
  }

  startPlayback();

  function stopAll() {
    stopped = true;
    cancelAnimationFrame(raf);
    for (const n of activeNotes) {
      try { n.stop(); } catch {}
    }
    activeNotes = [];
  }

  function pause() {
    if (stopped || paused) return;
    paused = true;
    cancelAnimationFrame(raf);
    baseTime = performance.now() / 1000 - startedAt;
    for (const n of activeNotes) {
      try { n.stop(); } catch {}
    }
    activeNotes = [];
  }

  function resume() {
    if (stopped || !paused) return;
    paused = false;
    startPlayback();
  }

  return {
    stop: stopAll,
    pause,
    resume,
    get isPaused() { return paused; },
  };
}

function pitchToNoteName(pitch: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(pitch / 12) - 1;
  const note = names[pitch % 12];
  return `${note}${octave}`;
}
