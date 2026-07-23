export type SynthHandle = {
  stop: () => void;
  pause: () => void;
  resume: () => void;
  isPaused: boolean;
};

export function synthMidi(
  notes: { pitch: number; start: number; end: number; velocity: number }[],
  onTime: (t: number) => void,
  offset = 0,
): SynthHandle {
  const ctx = new AudioContext();
  let raf: number;
  let stopped = false;
  let paused = false;
  let baseTime = offset;
  let segStart = ctx.currentTime + 0.05;

  const noteEvents: { time: number; pitch: number; dur: number; vel: number }[] = [];
  for (const n of notes) {
    noteEvents.push({ time: n.start, pitch: n.pitch, dur: Math.max(n.end - n.start, 0.01), vel: n.velocity / 127 });
  }
  noteEvents.sort((a, b) => a.time - b.time);

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.5;
  masterGain.connect(ctx.destination);

  const activeOscs: OscillatorNode[] = [];

  function elapsed(): number {
    return baseTime + (ctx.currentTime - segStart);
  }

  function scheduleNotes(fromTime: number) {
    for (const ev of noteEvents) {
      if (ev.time + ev.dur < fromTime) continue;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const noteStart = Math.max(ev.time, fromTime);
      const noteDur = ev.dur - (noteStart - ev.time);
      osc.type = "triangle";
      osc.frequency.value = 440 * Math.pow(2, (ev.pitch - 69) / 12);
      gain.gain.setValueAtTime(0, ctx.currentTime + (noteStart - fromTime));
      gain.gain.linearRampToValueAtTime(ev.vel * 0.6, ctx.currentTime + (noteStart - fromTime) + 0.01);
      gain.gain.setValueAtTime(ev.vel * 0.6, ctx.currentTime + (noteStart - fromTime) + noteDur * 0.7);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + (noteStart - fromTime) + noteDur);
      osc.connect(gain).connect(masterGain);
      osc.start(ctx.currentTime + (noteStart - fromTime));
      osc.stop(ctx.currentTime + (noteStart - fromTime) + noteDur + 0.01);
      activeOscs.push(osc);
    }
  }

  const lastEnd = noteEvents.length > 0 ? Math.max(...noteEvents.map((e) => e.time + e.dur)) : 0;

  scheduleNotes(offset);

  function tick() {
    if (stopped || paused) return;
    const t = Math.min(elapsed(), lastEnd);
    onTime(t);
    if (t < lastEnd) {
      raf = requestAnimationFrame(tick);
    } else {
      onTime(0);
    }
  }
  raf = requestAnimationFrame(tick);

  function stopAll() {
    stopped = true;
    cancelAnimationFrame(raf);
    for (const o of activeOscs) {
      try { o.stop(); } catch {}
    }
    activeOscs.length = 0;
    ctx.close();
  }

  function pause() {
    if (stopped || paused) return;
    paused = true;
    cancelAnimationFrame(raf);
    baseTime = elapsed();
    for (const o of activeOscs) {
      try { o.stop(); } catch {}
    }
    activeOscs.length = 0;
  }

  function resume() {
    if (stopped || !paused) return;
    paused = false;
    segStart = ctx.currentTime;
    scheduleNotes(baseTime);
    raf = requestAnimationFrame(tick);
  }

  return {
    stop: stopAll,
    pause,
    resume,
    get isPaused() { return paused; },
  };
}
