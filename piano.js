const NOTES = [
    { note: "C4",  freq: 261.63, key: "a", type: "white" },
    { note: "C#4", freq: 277.18, key: "w", type: "black" },
    { note: "D4",  freq: 293.66, key: "s", type: "white" },
    { note: "D#4", freq: 311.13, key: "e", type: "black" },
    { note: "E4",  freq: 329.63, key: "d", type: "white" },
    { note: "F4",  freq: 349.23, key: "f", type: "white" },
    { note: "F#4", freq: 369.99, key: "t", type: "black" },
    { note: "G4",  freq: 392.00, key: "g", type: "white" },
    { note: "G#4", freq: 415.30, key: "y", type: "black" },
    { note: "A4",  freq: 440.00, key: "h", type: "white" },
    { note: "A#4", freq: 466.16, key: "u", type: "black" },
    { note: "B4",  freq: 493.88, key: "j", type: "white" },
    { note: "C5",  freq: 523.25, key: "k", type: "white" },
];

const WHITE_COUNT = NOTES.filter((n) => n.type === "white").length;
const WHITE_WIDTH = 100 / WHITE_COUNT;
const BLACK_WIDTH = WHITE_WIDTH * 0.6;
const BLACK_HALF = BLACK_WIDTH / 2;

let audioCtx = null;
const activeOscillators = new Map();

function getAudioContext() {
    if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audioCtx = new Ctx();
    }
    return audioCtx;
}

// iOS Safari keeps the AudioContext suspended until a user gesture and will
// not produce sound until it is resumed. Playing a silent buffer on the first
// interaction reliably "unlocks" audio on mobile.
function unlockAudio() {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
        ctx.resume();
    }
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
}

function playNote(note) {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
        ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = "triangle";
    osc.frequency.value = note.freq;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.5);

    activeOscillators.set(note.note, { osc, startedAt: performance.now() });
}

function stopNote(note) {
    const entry = activeOscillators.get(note.note);
    if (!entry) return;
    // A quick tap (common on mobile) releases pointerup almost immediately.
    // If we stopped the oscillator then, the mobile audio thread would never
    // get a chance to start it, so we let short presses ring out. Longer
    // holds can still be released to cut the note.
    if (performance.now() - entry.startedAt < 120) {
        activeOscillators.delete(note.note);
        return;
    }
    try {
        entry.osc.stop();
    } catch (e) {
        /* already stopped */
    }
    activeOscillators.delete(note.note);
}

function buildKeyboard() {
    const piano = document.getElementById("piano");
    if (!piano) return;

    let whiteIndex = 0;
    const keyByChar = new Map();

    NOTES.forEach((note) => {
        const key = document.createElement("button");
        key.className = `key key--${note.type}`;
        key.dataset.note = note.note;
        key.setAttribute("aria-label", `${note.note} (key ${note.key.toUpperCase()})`);
        key.innerHTML = `<span class="key__label">${note.key.toUpperCase()}</span>`;

        if (note.type === "white") {
            whiteIndex += 1;
        } else {
            key.style.left = `${whiteIndex * WHITE_WIDTH - BLACK_HALF}%`;
            key.style.width = `${BLACK_WIDTH}%`;
        }

        const press = (event) => {
            event.preventDefault();
            unlockAudio();
            key.classList.add("key--active");
            playNote(note);
        };
        const release = () => {
            key.classList.remove("key--active");
            stopNote(note);
        };

        key.addEventListener("pointerdown", press);
        key.addEventListener("pointerup", release);
        key.addEventListener("pointerleave", release);
        key.addEventListener("pointercancel", release);

        piano.appendChild(key);
        keyByChar.set(note.key, { note, key });
    });

    const pressed = new Set();

    window.addEventListener("keydown", (event) => {
        const entry = keyByChar.get(event.key.toLowerCase());
        if (!entry || pressed.has(entry.note.note)) return;
        pressed.add(entry.note.note);
        unlockAudio();
        entry.key.classList.add("key--active");
        playNote(entry.note);
    });

    window.addEventListener("keyup", (event) => {
        const entry = keyByChar.get(event.key.toLowerCase());
        if (!entry) return;
        pressed.delete(entry.note.note);
        entry.key.classList.remove("key--active");
        stopNote(entry.note);
    });
}

// Unlock audio on the very first interaction anywhere on the page (covers
// taps that begin outside a key and mobile browsers that need an early gesture).
["pointerdown", "touchstart", "keydown"].forEach((evt) =>
    window.addEventListener(evt, unlockAudio, { once: true })
);

document.addEventListener("DOMContentLoaded", buildKeyboard);
