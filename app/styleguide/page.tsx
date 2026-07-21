"use client";

import { useRef, useState } from "react";
import Analysis from "@/components/analyze";
import PianoRoll from "@/components/PianoRoll";
import Spectrogram from "@/components/Spectrogram";
import Visualizer from "@/components/Visualizer";
import type { TranscribeResult } from "@/lib/music";

type Note = TranscribeResult["notes"][number];

const SAMPLE_NOTES: Note[] = [
  { pitch: 60, start: 0.0, end: 0.5, velocity: 90 },
  { pitch: 64, start: 0.5, end: 1.0, velocity: 80 },
  { pitch: 67, start: 1.0, end: 1.5, velocity: 85 },
  { pitch: 72, start: 1.5, end: 2.0, velocity: 100 },
  { pitch: 67, start: 2.0, end: 2.5, velocity: 75 },
  { pitch: 64, start: 2.5, end: 3.0, velocity: 80 },
  { pitch: 60, start: 3.0, end: 3.6, velocity: 90 },
];

const SAMPLE_ANALYSIS: TranscribeResult["analysis"] = {
  key: { tonic: "C", mode: "major", confidence: 0.92 },
  tempo: { bpm: 120, confidence: 0.88 },
  time_signature: { numerator: 4, denominator: 4, confidence: 0.95 },
  chords: [
    { root: "C", quality: "M", start: 0, end: 1 },
    { root: "A", quality: "m", start: 1, end: 2 },
    { root: "F", quality: "M", start: 2, end: 3 },
    { root: "G", quality: "M", start: 3, end: 4 },
  ],
};

const COLOR_ROLES = [
  ["--bg", "--bg"],
  ["--panel-2", "--panel-2"],
  ["--panel-3", "--panel-3"],
  ["--accent", "--accent"],
  ["--accent-2", "--accent-2"],
  ["--danger", "--danger"],
  ["--success", "--success"],
  ["--border", "--border"],
  ["--border-strong", "--border-strong"],
] as const;

const RADIUS_SCALE = ["--r-sm", "--r-md", "--r-lg", "--r-xl", "--r-full"];
const SPACING_SCALE = ["--s-1", "--s-2", "--s-3", "--s-4", "--s-5", "--s-6", "--s-7", "--s-8"];
const TYPE_SCALE = ["--fs-xs", "--fs-sm", "--fs-base", "--fs-md", "--fs-lg", "--fs-xl", "--fs-2xl"];

function readVar(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function Swatch({ role }: { role: readonly [string, string] }) {
  const [cssVar, token] = role;
  const [value, setValue] = useState("");
  const setRef = (el: HTMLDivElement | null) => {
    if (el) setValue(readVar(cssVar));
  };
  return (
    <div className="skel" style={{ borderRadius: "var(--r-md)", overflow: "hidden", border: "1px solid var(--border)" }}>
      <div ref={setRef} style={{ height: 56, background: `var(${cssVar})` }} />
      <div style={{ padding: "var(--s-2) var(--s-3)" }}>
        <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)" }}>{token}</div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>{value}</div>
      </div>
    </div>
  );
}

function ScaleRow({ tokens, unit }: { tokens: readonly string[]; unit: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)" }}>
      {tokens.map((t) => (
        <div key={t} className="artifact" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
          <span style={{ fontSize: 11 }}>{t}</span>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>{unit}</span>
        </div>
      ))}
    </div>
  );
}

function Section({ title, fileLine, children }: { title: string; fileLine: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "var(--s-7)" }}>
      <div className="section-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span>{title}</span>
        <code style={{ fontSize: 11, color: "var(--muted)", textTransform: "none", letterSpacing: 0 }}>{fileLine}</code>
      </div>
      {children}
    </section>
  );
}

export default function Styleguide() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  return (
    <div className="page" data-theme={theme} style={{ maxWidth: 960 }}>
      <header className="topbar">
        <div className="brand"><span className="brand-dot" /> Design System</div>
        <button
          className="btn"
          data-testid="theme-toggle"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        >
          {theme === "dark" ? "Light" : "Dark"} theme
        </button>
      </header>

      <p className="muted" style={{ margin: "0 0 var(--s-5)" }}>
        Isolated component gallery for design review — the single source of truth for the
        design system. Toggle the theme above to verify light/dark parity. Every component in
        the app must be built from these tokens and primitives; extend the token system, never
        invent ad-hoc styled elements.
      </p>

      <Section title="Design principles (what NOT to do)" fileLine="app/globals.css">
        <ul className="muted" style={{ margin: 0, paddingLeft: "var(--s-4)", display: "grid", gap: "var(--s-1)", fontSize: "var(--fs-sm)", lineHeight: "var(--line-height-base)" }}>
          <li>No giant gradients as decoration — gradients are reserved for brand accents only.</li>
          <li>No glassmorphism / heavy blur backdrops everywhere — keep surfaces solid tokens.</li>
          <li>No random colors — every color comes from a CSS variable token.</li>
          <li>No inconsistent spacing — use the 8px scale (--s-1…--s-8), never ad-hoc px.</li>
          <li>Max two brand colors (--accent, --accent-2) plus neutrals.</li>
          <li>Max two font families (sans + mono) from the type scale.</li>
          <li>No emoji icons — use text labels or SVG glyphs.</li>
          <li>No huge border radius — radius is fixed and modest (--r-sm…--r-lg).</li>
          <li>Never invent a new Button / Card / Input variant — extend tokens only.</li>
          <li>At most 1–2 signature hover/state animations; the rest stays functional.</li>
        </ul>
      </Section>

      <Section title="Color roles" fileLine="app/globals.css:4">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "var(--s-3)" }}>
          {COLOR_ROLES.map((role) => (
            <Swatch key={role[0]} role={role} />
          ))}
        </div>
      </Section>

      <Section title="Radius scale" fileLine="app/globals.css:22">
        <ScaleRow tokens={RADIUS_SCALE} unit="radius" />
        <div style={{ display: "flex", gap: "var(--s-3)", marginTop: "var(--s-3)", alignItems: "flex-end" }}>
          {RADIUS_SCALE.map((r) => (
            <div key={r} className="surface" style={{ width: 64, height: 64, borderRadius: `var(${r})`, display: "grid", placeItems: "center", fontSize: 10 }}>
              {r.replace("--r-", "")}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Spacing scale" fileLine="app/globals.css:27">
        <ScaleRow tokens={SPACING_SCALE} unit="space" />
        <div style={{ display: "flex", gap: "var(--s-2)", marginTop: "var(--s-3)", alignItems: "flex-end" }}>
          {SPACING_SCALE.map((s) => (
            <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: 24, height: `var(${s})`, background: "var(--accent)" }} />
              <span style={{ fontSize: 10, color: "var(--muted)" }}>{s}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type scale" fileLine="app/globals.css:37">
        <ScaleRow tokens={TYPE_SCALE} unit="font" />
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)", marginTop: "var(--s-3)" }}>
          {TYPE_SCALE.map((t) => (
            <div key={t} style={{ fontSize: `var(${t})`, fontWeight: "var(--fw-semibold)" }}>
              {t} — Music AI Studio
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons & chips" fileLine="app/globals.css:194">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)", alignItems: "center" }}>
          <button className="btn">.btn</button>
          <button className="btn btn-primary">.btn-primary</button>
          <button className="btn btn-ghost">.btn-ghost</button>
          <button className="icon-btn">.icon-btn</button>
          <button className="icon-btn ghost danger">.icon-btn.ghost.danger</button>
          <button className="btn" disabled>.btn disabled</button>
          <button className="icon-btn" disabled>.icon-btn disabled</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)", marginTop: "var(--s-3)", alignItems: "center" }}>
          <span className="chip">.chip</span>
          <span className="chip ghost">.chip.ghost</span>
          <span className="chip-q major">C major</span>
          <span className="chip-q minor">A minor</span>
          <span className="chip-q dim">B dim</span>
          <span className="badge">.badge</span>
        </div>
      </Section>

      <Section title="Inputs & labels" fileLine="app/globals.css:356">
        <div style={{ display: "grid", gap: "var(--s-3)", maxWidth: 360 }}>
          <div>
            <label className="label">Track name</label>
            <input className="input" placeholder="e.g. Moonlight Sonata" />
          </div>
          <div>
            <label className="label">Library</label>
            <select className="sel" style={{ width: "100%" }}>
              <option>All tracks</option>
              <option>Transcribed</option>
            </select>
          </div>
        </div>
      </Section>

      <Section title="Surfaces, feedback & media" fileLine="app/globals.css:101">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-3)" }}>
          <div className="surface">.surface (default)</div>
          <div className="surface raised">.surface.raised</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-3)", marginTop: "var(--s-3)", alignItems: "center" }}>
          <div className="drop-zone" style={{ flex: 1, minWidth: 200 }}><span className="drop-icon">+</span><span className="muted">.drop-zone idle</span></div>
          <div className="drop-zone drag-over" style={{ flex: 1, minWidth: 200 }}><span className="drop-icon">+</span><span className="muted">.drop-zone drag-over</span></div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-3)", marginTop: "var(--s-3)", alignItems: "center" }}>
          <span className="spinner" />
          <span className="skel line" style={{ width: 160 }} />
          <span className="skeleton" style={{ width: 160, height: 24, borderRadius: "var(--r-md)" }} />
          <span className="empty" style={{ flex: 1, minWidth: 200 }}>.empty state</span>
        </div>
        <div className="toast show" style={{ position: "static", transform: "none", marginTop: "var(--s-3)", display: "inline-block" }}>.toast notification</div>
        <div className="alert-danger" style={{ marginTop: "var(--s-3)" }}>.alert-danger message</div>
      </Section>

      <Section title="Playback bar" fileLine="app/globals.css:448">
        <div className="playbar">
          <button className="pb-btn">▶</button>
          <div className="pb-track"><div className="pb-fill" style={{ width: "40%" }} /></div>
          <span className="pb-time">0:48 / 2:01</span>
        </div>
      </Section>

      <Section title="PianoRoll" fileLine="components/PianoRoll.tsx:11">
        <div className="card">
          <PianoRoll notes={SAMPLE_NOTES} bpm={120} />
        </div>
      </Section>

      <Section title="Spectrogram" fileLine="components/Spectrogram.tsx:7">
        <Spectrogram url="/sample-not-found.wav" />
      </Section>

      <Section title="Visualizer" fileLine="components/Visualizer.tsx:12">
        <Visualizer audioRef={audioRef} />
      </Section>

      <Section title="Library track card" fileLine="components/library/index.tsx:437">
        <div className="track">
          <div className="track-head">
            <div className="track-name">My Song Demo</div>
            <div className="track-meta"><span>3.2 MB</span></div>
            <div className="track-actions">
              <button className="icon-btn">▶</button>
              <button className="icon-btn">Transcribe</button>
              <button className="icon-btn">Analyze</button>
              <button className="icon-btn ghost danger">✕</button>
            </div>
          </div>
          <div className="track-artifacts">
            <span className="artifact"><span className="dot" /> Original audio</span>
            <span className="artifact pending"><span className="dot" /> MIDI — transcribe to generate</span>
          </div>
        </div>
        <div className="track">
          <div className="track-head">
            <div className="track-name">Moonlight Sonata</div>
            <div className="track-meta"><span>5.1 MB</span></div>
            <div className="track-actions">
              <button className="icon-btn">⏸</button>
              <button className="icon-btn">Transcribe</button>
              <button className="icon-btn">Analyze</button>
              <button className="icon-btn ghost danger">✕</button>
            </div>
          </div>
          <div className="track-artifacts">
            <span className="artifact"><span className="dot" /> Original audio</span>
            <span className="artifact done"><span className="dot" /> MIDI — transcribed</span>
          </div>
        </div>
      </Section>

      <Section title="Transcribe source grid" fileLine="components/transcribe/index.tsx:237">
        <div className="source-grid">
          <div className="source-card"><span className="sc-icon">⬆</span><span className="sc-label">Upload file</span><span className="sc-hint">WAV · MP3 · M4A</span></div>
          <div className="source-card"><span className="sc-icon">●</span><span className="sc-label">Record</span><span className="sc-hint">Use your mic</span></div>
          <div className="source-card disabled"><span className="sc-icon">▤</span><span className="sc-label">From library</span><span className="sc-hint">No saved tracks</span></div>
        </div>
      </Section>

      <Section title="Transcribe result" fileLine="components/transcribe/index.tsx:304">
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "var(--fs-base)" }}>demo-track.wav</h3>
              <p className="muted" style={{ margin: "var(--s-1) 0 0" }}>{SAMPLE_NOTES.length} notes</p>
            </div>
            <div style={{ display: "flex", gap: "var(--s-2)" }}>
              <button className="btn">Save to library</button>
              <button className="btn btn-primary">Analyze</button>
              <button className="btn btn-ghost">✕ Clear</button>
            </div>
          </div>
          <div className="section-label">Piano roll</div>
          <PianoRoll notes={SAMPLE_NOTES} bpm={120} />
        </div>
      </Section>

      <Section title="Analysis" fileLine="components/analyze/index.tsx:37">
        <Analysis analysis={SAMPLE_ANALYSIS} notes={SAMPLE_NOTES} audioName="demo-track.wav" numNotes={SAMPLE_NOTES.length} />
      </Section>

      <div className="footer">Music AI Studio — design system preview</div>
    </div>
  );
}
