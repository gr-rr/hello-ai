# Design System & Flow

This folder holds the **design layer** for hello-ai, kept separate from implementation
so the coding agent builds against an approved look instead of inventing UI ad hoc.

## Flow

```
Requirements ──▶ Design Agent ──▶ Mockup (PNG + tokens.json)
                                     │
                                     ▼
                            Implementation Agent (reads design/, not the prompt)
                                     │
                                     ▼
                                  Website (globals.css tokens + .btn/.card/.chip primitives)
                                     │
                                     ▼
                       Playwright screenshot ──▶ Vision QA diff vs mock ──▶ fixes
```

1. **Design** produces `design/tokens.json` + a mockup HTML/PNG (see `mockups/`).
2. **Implement** consumes the tokens (mirrored in `app/globals.css :root`) and the
   primitive classes (`.btn`, `.btn-primary`, `.chip`, `.panel-box`, `.surface-card`,
   `.input`, `.muted`). Do not hard-code colors/spacing — use tokens.
3. **QA** renders the running app with Playwright and compares against the mockup PNG;
   a vision model flags drift (wrong radius, spacing, color, typography).

## Files
- `tokens.json` — single source of truth (color, radius, spacing, type, elevation, motion).
- `mockups/audio-to-sheet-music.html` — editable mockup (uses the real tokens via globals.css).
- `mockups/audio-to-sheet-music.png` — rendered reference image for the focused product flow.
- `app/globals.css` — `:root` block is the CSS mirror of `tokens.json`; primitive classes below it.

## Regenerating the mockup PNG
```bash
# from repo root
cat > shot.mjs <<'EOF'
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 });
await p.goto('file://' + process.cwd() + '/design/mockups/audio-to-sheet-music.html');
await p.waitForTimeout(300);
await p.screenshot({ path: 'design/mockups/audio-to-sheet-music.png', fullPage: true });
await b.close();
EOF
node shot.mjs && rm shot.mjs
```

## Tokens → usage
| Token group | CSS var prefix | Example |
|-------------|----------------|---------|
| Color       | `--bg --panel --accent --border` | `background: var(--panel)` |
| Radius      | `--r-sm…--r-full` | `border-radius: var(--r-lg)` |
| Spacing     | `--s-1…--s-8` | `padding: var(--s-5)` |
| Type        | `--fs-* --fw-*` | `font-size: var(--fs-md)` |
| Elevation   | `--shadow-*` `--ring` | `box-shadow: var(--shadow-md)` |
| Motion      | `--ease --dur` | `transition: ... var(--dur) var(--ease)` |

Keep `tokens.json` and `:root` in sync.
