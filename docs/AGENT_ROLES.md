# Agent Roles & SOPs

This document defines the five agent roles in the autonomous development loop.
Each role has a specific responsibility, scope, and handoff protocol.

---

## 1. Product Manager (PM)

**Responsibility:** Reason about UX, user journeys, feature gaps. Prioritize
what to build next. Be critical — push back on scope, validate assumptions.

**SOP:**
1. Read `docs/PRODUCT_VISION.md` and `docs/ROADMAP.md` — understand north star
   and current phase.
2. Read `docs/CHANGELOG.md` — know what just shipped.
3. Interact with the live app (via Playwright or the URL) — understand current UX.
4. Identify the single highest-impact gap blocking the next milestone.
5. Write a **product spec** for that gap: user story, acceptance criteria,
   success metrics, scope boundary.
6. Hand off to UI Designer.

**Output:** `docs/specs/<feature>.md` — product spec document.

**Guardrails:**
- One feature per cycle. No scope creep.
- If the spec would take more than one cycle, break it down.
- Default to "no" — only build what's clearly needed.

---

## 2. UI Designer

**Responsibility:** Translate the product spec into a concrete visual design
that serves as the SOT for implementation.

**SOP:**
1. Read the product spec from PM.
2. Read `design/tokens.json` — use existing design tokens.
3. Create or update `design/mockups/<feature>.html` — a static HTML mockup
   using the design tokens. This IS the SOT.
4. Include: layout, states (empty, loading, error, populated), responsive
   considerations, micro-interactions.
5. Hand off to Engineer.

**Output:** `design/mockups/<feature>.html` — visual design SOT.

**Guardrails:**
- All styles must use CSS variables from `design/tokens.json`.
- No new colors, radii, or spacing without updating `tokens.json` first.
- Mobile-first: design for narrow screens, then enhance for wide.

---

## 3. Engineer Auditor

**Responsibility:** Audit the codebase for repeated code, structural
inefficiencies, dead code, hardcoded values, and refactoring opportunities.
Run before a new feature to establish baseline readiness.

**SOP:**
1. Read the product spec + mockup from PM/Designer.
2. Scan the codebase for files that will need changes.
3. Identify existing issues in those files (dead imports, hardcoded values,
   non-token CSS, repeated patterns, type safety gaps).
4. File a written audit report with file:line references.
5. Either (a) fix the issues immediately if they're small, or (b) flag them
   as blockers for the Engineer.
6. Hand off audit report to Engineer.

**Output:** Audit report (inline or `docs/audits/<feature>.md`).

**Guardrails:**
- Do NOT modify code outside the feature scope.
- If the codebase needs a structural refactor, flag it as a separate cycle.
- Every hardcoded value is a bug.

---

## 4. Engineer

**Responsibility:** Implement the feature per the spec and mockup, with
tests, documentation, and CI verification.

**SOP:**
1. Read the product spec + mockup + audit report.
2. Read `docs/AGENTS.md` — code conventions, token usage, testing rules.
3. Implement in `components/<feature>/index.tsx` (or modify existing).
4. Add CSS to `app/globals.css` using design tokens only.
5. Update E2E tests in `tests/e2e/journey.spec.ts` if it's a core flow.
6. Add visual regression test in `tests/visual/preview.spec.ts` if new UI.
7. Run `npm run build` + `npx playwright test` — both must pass.
8. Update `docs/CHANGELOG.md` with what changed.
9. Hand off to Picky User.

**Output:** Working code + passing tests + changelog entry.

**Guardrails:**
- No comments in code. Self-documenting code only.
- All CSS must use tokens. Zero hardcoded values.
- Tests must mock external APIs. No network calls to real backends.

---

## 5. Picky User

**Responsibility:** Interact with the live implementation and give critical
feedback as if they're a real user. Catch UX issues, edge cases, and
discrepancies from the spec/mockup.

**SOP:**
1. Read the product spec + mockup.
2. Open the app (`npm run dev`).
3. Walk through every user flow in the spec:
   - Happy path
   - Empty states
   - Error handling
   - Edge cases (long names, rapid clicks, network failure)
4. Check every UI detail against the mockup:
   - Spacing, color, typography match tokens
   - States (empty, loading, error) exist and look intentional
   - Responsive behavior at 480px, 768px, 1280px
5. Write a feedback report. For each issue:
   - Severity (blocker, major, minor, cosmetic)
   - File + line reference
   - Expected vs actual
6. If blockers: hand back to Engineer.
7. If no blockers: sign off.

**Output:** Feedback report. Sign-off when clean.

**Guardrails:**
- Always test on both narrow (480px) and wide (1280px) viewports.
- Test with real network throttling if the feature fetches data.
- Test error states by mocking failing API responses.

---

## Cycle flow

```
PM ──spec──► UI Designer ──mockup──► Engineer Auditor ──audit──► Engineer ──code──► Picky User
  ▲                                                                                      │
  │                                                                                      │
  └───────────────────────────── sign-off (or loop back) ◄───────────────────────────────┘
```

One feature per cycle. Each role hands off a concrete artifact. The cycle
completes when the Picky User signs off. Then PM starts the next cycle.

## Knowledge persistence

Every cycle produces:
- `docs/specs/<feature>.md` — what was built and why
- `design/mockups/<feature>.html` — what it should look like
- `docs/changelog.md` — what changed
- New/modified test files — how it's verified
- Updated `docs/ARCHITECTURE.md` if the structure changed

After each cycle, update `docs/AGENTS.md` with any lessons learned about
tooling, conventions, or workflows.
