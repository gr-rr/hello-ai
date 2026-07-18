# Design System — Source of Truth

This document is the authoritative design reference for Music AI Studio. It complements `AGENTS.md` (which governs engineering conventions) and the product docs in `docs/`.

## Rule

**Components must consume design tokens. Never hardcode colors, spacing, radii, font sizes, weights, shadows, or motion values in CSS or inline styles.** Hardcoded values are the root cause of the inconsistent no-auth landing and must be treated as a defect.

## Token Source of Truth

- `design/tokens.json` — the canonical token definitions (colors, gradients, radii, spacing, typography, elevation, motion, component presets). Values mirror `app/globals.css` exactly.
- `app/globals.css` — the runtime surface; it consumes the tokens as CSS custom properties. Edit tokens **first**, then reflect them here. Do not introduce values in CSS that are absent from `tokens.json`.

## Visual Mockups

- `design/mockups/landing.html` — standalone, build-free mockup of the no-auth landing (hero + Sign in with Google + value prop). Inline styles map 1:1 to token values, so it is a visual SOT reference.

## Change Workflow

Any visual change starts from:
1. Editing `design/tokens.json` (the SOT).
2. Reflecting the change in `app/globals.css` (variables only).
3. Updating or adding a mockup under `design/mockups/*.html` to show the change.
4. Using the tokens in components — never ad-hoc literals.

## Token Categories

| Category | Keys | Notes |
|---|---|---|
| Color | `bg`, `panel`, `panel-2`, `panel-3`, `text`, `muted`, `accent`, `accent-2`, `accent-soft`, `danger`, `success`, `border`, `border-strong` | Surfaced as `--bg`, `--panel`, etc. |
| Gradient | `grad-accent`, `grad-accent-2` | `--grad-accent`, `--grad-accent-2` |
| Radius | `sm`, `md`, `lg`, `xl`, `full` | `--r-sm` … `--r-full` |
| Spacing | `1`–`8` | `--s-1` … `--s-8` |
| Typography | `font-sans`, `font-mono`, `scale` (xs–2xl), `weight` (normal–bold) | `--fs-*`, `--fw-*` |
| Elevation | `sm`, `md`, `lg`, `ring` | `--shadow-*`, `--ring` |
| Motion | `ease`, `duration` | `--ease`, `--dur` |

## Component Presets

`tokens.json` ships reusable component presets under `components` (button, chip, card, panel, input) so primitives stay consistent across the app.
