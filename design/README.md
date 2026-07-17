# Design System & Flow

This folder holds the **design layer** for hello-ai, kept separate from implementation
so the coding agent builds against an approved look instead of inventing UI ad hoc.

## Flow

```
Requirements ──▶ Design Agent ──▶ Mockup (design/mockups/*.html + tokens.json)
                                     │  source of truth (SOT)
                                     ▼
                            Implementation Agent (reads design/, not the prompt)
                                     │
                                     ▼
                  Website (globals.css tokens + .btn/.card/.chip primitives)
                                     │
                                     ▼
   Argos CI (.github/workflows/argos.yml) ──▶ captures mockup + app ──▶ diff vs main baseline on every PR
                                     │
                                     ▼
                          PR check: review visual changes, approve/reject, iterate
```

Argos is the feedback loop: it screenshots the **design mockup** (SOT) and the
**real built app** on every PR and diffs them against the `main` baseline, posting
results as a PR check. Edit the mockup (design) or components (implementation) and
push — Argos shows what changed visually so you can iterate.

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

## Visual QA loop (Argos)
Set up once:
1. Create a project at https://app.argos-ci.com.
2. Add `ARGOS_TOKEN` to repo **Settings → Secrets → Actions** (or use tokenless OIDC — see Argos GH Actions auth docs).

Then every PR automatically:
- builds the app, starts it,
- runs `tests/visual/preview.spec.ts` (design mockup + app overview + app transcribe),
- uploads screenshots to Argos, which diffs against the `main` baseline and reports on the PR.

Local run (no upload): `npx playwright test` (screenshots land in `./screenshots`, gitignored).

Regenerating the mockup PNG (for local preview only):
```bash
npx playwright test preview.spec.ts:5   # or open design/mockups/audio-to-sheet-music.html in a browser
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
