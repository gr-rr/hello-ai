# Design System

This folder holds the **design layer** for hello-ai. `tokens.json` is the single
source of truth for colors, spacing, typography, and component primitives.

## Flow

```
tokens.json (SOT) ──▶ app/globals.css (:root mirror) ──▶ Components
```

1. **tokens.json** defines all design values.
2. **globals.css** mirrors tokens as CSS variables and defines primitive classes.
3. Components consume CSS variables — never hardcode colors/spacing.

## Files
- `tokens.json` — design tokens (color, radius, spacing, type, elevation, motion).
- `mockups/` — reference mockups.

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
