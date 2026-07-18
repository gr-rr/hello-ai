import { http, HttpResponse, delay } from "msw";
import { sampleWavBase64, sampleWavOutputBase64 } from "@/tests/fixtures/sample-wav";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function pitchToName(p: number): string {
  return NOTE_NAMES[((p % 12) + 12) % 12] + (Math.floor(p / 12) - 1);
}

// C major scale notes: C4(60), D4(62), E4(64), F4(65), G4(67), A4(69), B4(71), C5(72)
const SCALE = [60, 62, 64, 65, 67, 69, 71, 72];
const fakeNotes = Array.from({ length: 42 }, (_, i) => {
  const pitch = SCALE[i % SCALE.length];
  const start = i * 0.25;
  const end = start + 0.22;
  return { pitch, start, end, velocity: 80 + Math.floor(Math.random() * 40) };
});

const wavBase64 = sampleWavBase64;

export const handlers = [
  http.post("/api/music/enhance", async () => {
    await delay(200);
    return HttpResponse.json({
      wav_base64: wavBase64,
      url: null,
    });
  }),

  http.post("/api/music/transcribe", async () => {
    await delay(1500);

    const midiBase64 =
      "TVRoZAAAAAYAAAABAAIBTVRyawAAAAwAAQDIz+oAQM3P6v4A";

    return HttpResponse.json({
      notes: fakeNotes,
      num_notes: fakeNotes.length,
      midi_base64: midiBase64,
      wav_base64: sampleWavOutputBase64,
      analysis: {
        key: { tonic: "C", mode: "major", confidence: 0.8 },
        tempo: { bpm: 120, confidence: 0.92 },
        time_signature: { numerator: 4, denominator: 4, confidence: 0.95 },
      },
    });
  }),
];
