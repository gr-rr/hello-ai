import { http, HttpResponse, delay } from "msw";
import { sampleWavBase64, sampleWavOutputBase64 } from "@/tests/fixtures/sample-wav";
import { pitchToName } from "@/lib/notes";

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
      midi_url: "https://example.com/mock-transcription.mid",
      wav_url: "https://example.com/mock-transcription.wav",
      analysis: {
        key: { tonic: "C", mode: "major", confidence: 0.8 },
        tempo: { bpm: 120, confidence: 0.92 },
        time_signature: { numerator: 4, denominator: 4, confidence: 0.95 },
      },
    });
  }),

  http.post("/api/music/analyze", async () => {
    await delay(1200);
    return HttpResponse.json({
      key: { tonic: "A", mode: "minor", confidence: 0.82 },
      tempo: { bpm: 112, confidence: 0.88 },
      time_signature: { numerator: 4, denominator: 4, confidence: 0.9 },
      chords: [
        { root: "A", quality: "m", start: 0.0, end: 2.0 },
        { root: "F", quality: "M", start: 2.0, end: 4.0 },
        { root: "C", quality: "M", start: 4.0, end: 6.0 },
        { root: "G", quality: "M", start: 6.0, end: 8.0 },
        { root: "A", quality: "m", start: 8.0, end: 10.0 },
      ],
    });
  }),

  http.post("/api/music/library", async ({ request }) => {
    await delay(200);
    const body = (await request.json()) as {
      title?: string;
      midi_url?: string;
      wav_url?: string;
      notes?: unknown[];
    };
    const id = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join("");
    return HttpResponse.json({
      id,
      title: body.title ?? "Untitled transcription",
      midi_url: body.midi_url,
      wav_url: body.wav_url,
      notes: body.notes ?? [],
      created_at: new Date().toISOString(),
    });
  }),

  http.delete("/api/music/library/transcription/:recordId", async () => {
    await delay(150);
    return HttpResponse.json({ status: "deleted" });
  }),
];
