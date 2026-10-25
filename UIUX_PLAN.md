# UI/UX Overhaul Plan — Calm precision

Branch `feat/uiux-overhaul` (base `5db0d43`). Authoritative spec: `uiuxpro.md`. Re-read at the start of each phase; continue from the first unchecked item.

## Design contract (§2–§4 digest)
- Identity: editorial study tool — warm paper, ink text, one cobalt accent, serif only for questions/major headings, hairline dividers, few surfaces. Never a default template.
- Theme: light workspace/landing/auth, dark "stage" studio, Settings System/Light/Dark honored everywhere; resolved before paint via `color-scheme` + `theme-color`, no flash.
- Tokens (OKLCH → Tailwind `@theme`): light bg `.985/.004/85` · surface `1` · sunken `.965` · line `.9` · text `.2/.02/265` · muted `.46` · accent `.52/.19/262`; dark bg `.16` · surface `.2` · raised `.25` · line `.3` · text `.96` · muted `.72` · accent `.74/.14/262`. Semantic success 155 / warning 80 / error 25, always icon + text. Accent ≤5% of a screen, one primary action per view.
- Type: Geist UI + one serif (questions, h1/h2) + Geist Mono, self-hosted latin with size-adjusted fallbacks; 12/13/14/16/18/20/24-28/32-40 + fluid display; body 1.6, prose 60-75ch, tabular numerals.
- Shape/space: 4px scale, gutters 16/24/32, radii 8/12/20/full, ≤2 elevations, hairline borders, cards only for discrete objects, one icon set, no emoji.
- Microcopy: sentence case, verb+object buttons, no hype, errors state cause + next step, `Intl` dates/numbers.
- Platform: mobile 390-first (320-767) — `viewport-fit=cover`, `dvh` + safe-area, ≤5-tab bottom bar (56px) hidden in the studio, 90dvh sheets, 44px targets, 16px inputs, `visualViewport`-aware composer; tablet 768-1023 rail + 1-2 columns; desktop 1024+ collapsible sidebar 240→64, widths 1200/720/1120, ⌘K palette, ⌘↵ submit, Esc closes overlays only, two-pane studio/debrief.
- Motion 120-240ms `cubic-bezier(.2,0,0,1)`, opacity/transform only, no route animation; reduced motion = opacity or none. Perf: LCP ≤2.5s / INP ≤200ms / CLS ≤0.05, no waterfalls, 250-300ms debounced search, abort stale requests.
- Anti-generic gate: exactly one primary action, hierarchy survives a squint, every element earns its place, copy is product-specific.

## Route inventory (states = loading / empty / error)
| Route | File | Purpose | Data | States |
| --- | --- | --- | --- | --- |
| `/` | `app/page.tsx` → `DashboardView` | next-up, readiness, topic map, recent | `/dashboard`, `/interview/sessions` | spinner / partial / retry ✓, no skeletons, no route `error.tsx` |
| `/interview` | `app/interview/page.tsx` + `InterviewStudio` | setup, then live round via `?resume=` | `/resume`, `/interview/session*` | spinner / resume gate / banner ✓ |
| `/interview/[id]/debrief` | `.../debrief/page.tsx` → `DebriefView` | per-question debrief, dispute | `/interview/session/{id}` | spinner / partial debrief / retry ✓ |
| `/resume` | `app/resume/page.tsx` | upload, confirm profile | `/resume`, `/resume/confirm` | spinner / no-profile ✓ / load + save banners ✓ |
| `/history` | `app/history/page.tsx` | saved rounds | `/interview/sessions` | spinner / none / retry ✓ |
| `/tracker` | `app/tracker/page.tsx` | prep kanban | `/tracker` | spinner / per-column Empty ✓ / **no error** |
| `/company-prep` | `app/company-prep/page.tsx` | company research packs | `/company-prep*` | spinner / **no empty** / error ✓ |
| `/settings` | `app/settings/page.tsx` | role, credentials, data | `/auth/me`, `/auth/groq-key` | spinner / — / **no error** |
| `/_not-found` | Next default | 404 | — | **unstyled, no way back** |

## Top 10 UX defects (ranked by core-loop impact: setup → interview → debrief)
1. Studio is voice-first: orb + "Ready" consume ~45% of a 390px screen, the question floats mid-page, and typing is hidden behind a small "Type answer instead" link (§5.1 wants question-dominant, textarea-first).
2. Studio header shows a meaningless "0" score chip and "Q1/3" while hiding the real timer, progress bar and draft state.
3. No draft autosave — a refresh mid-answer loses typed text; only submitted answers survive.
4. Navbar right cluster overflows at 768 on 8/9 routes (scrollWidth 835-838 vs 768): groq badge + avatar never collapse.
5. Fixed bottom tab bar overflows at 320 (336 > 320) and overlays content mid-scroll (Placement Readiness, history rows) — no bottom padding or safe-area inset.
6. `color-contrast` serious on every route (up to 30 nodes): orange `#B3582A` on `#FAF2ED` pills, uppercase tracking labels, nav links; the 1.4/5.0 score badges are worst.
7. Setup dumps 9 focus cards + 2 styles + 3 lengths at once, with no live summary, no last-used defaults, no advanced disclosure, and a card-shaped hole in row 3.
8. Debrief on an unanswered session still renders "what to improve / stronger model answer" for a turn with no answer — an unsupported evaluation claim.
9. History labels every row "Review feedback" (in-progress included), with no date grouping/filter and rows that reflow when the score pill is absent.
10. A11y blockers: 4 unlabeled resume inputs (`label` critical), unnamed settings `select`, icon-only studio button without a name, tracker scroll region not focusable.

## Dead controls
None found by grep (`href="#"`, empty handlers, `console.log`, TODO): 0 hits. Required-but-missing controls are additions, not dead code: theme switcher, ⌘K palette, route `error.tsx`/`not-found.tsx`, skeletons, tracker/company-prep/settings empty + error states.

## Phase checklist
- [x] **P0 recon + baseline** — sweep script `scripts/uiux-sweep.mjs`; 80-run baseline (`.uiux/reports/before.json`), 30 before shots; defects above.
- [ ] **P1 foundations** — OKLCH tokens, fonts, pre-paint theme, AppShell/StudioShell/AuthShell, primitives + patterns, viewport/safe-area/focus/reduced-motion CSS, fix 768 navbar + 320 bottom nav.
- [ ] **P2 core loop** — Studio (desktop two-pane, mobile question-first), Setup, Dashboard, Debrief.
- [ ] **P3 learning system** — question bank/drills, resume, history + progress.
- [ ] **P4 entry/account** — landing, auth, onboarding, settings, 404/error.
- [ ] **P5 hardening** — keyboard-only pass, dead-control sweep, 200% zoom, reduced motion, offline/slow network, Lighthouse.
- [ ] **P6 verification** — lint/types/tests/build + mobile & desktop E2E journeys, final report, "UI conventions" in `AGENTS.md`.
- Gate per phase: 8-viewport sweep = 0 console errors/warnings, 0 overflow, 0 serious/critical axe; no lint/type/build regressions; ≤6 shots reviewed; commit `feat(uiux): <phase>`.

## Decisions
- No new UI library (none installed; adding shadcn/Radix would be a large unverified surface) — primitives live in `components/ui/` on the existing Tailwind v4 tokens + `lucide-react`.
- Serif: Newsreader via `next/font/google` (build-time self-host, no runtime third-party fetch); UI stays Geist, code Geist Mono.
- Topic-map thresholds on the existing 1-5 scale: untested = 0 answers, needs work < 3.0, developing 3.0-3.9, strong ≥ 4.0 (≥1 answered turn per topic, recency-weighted mean).
- Theme stored in `localStorage` + cookie and applied by inline pre-paint script; the studio defaults to dark only when no explicit choice exists.
- Playwright + axe stay devDependencies — test-only, no runtime bundle impact.

## Known issues
- Baseline lint is red: 81 problems (48 errors, 33 warnings), mostly `no-explicit-any` in `OnboardingWizard`, `TTSComponent`, `lib/api.ts`, `lib/speech.ts`, `Navbar`. "No worse than baseline" is measured against this; P5 targets zero.
- Sweep noise: studio `[NeuralVoiceEngine] Autoplay blocked` ×8 is browser autoplay policy, and the 404 document load on `/_not-found` is the requested artifact — allowlisted per route, never globally.
- Only `/health` exists (`/api/health` is 404), so the sweep probes routes rather than the API.

## Follow-ups
- Question bank/drills lists and score trends need endpoints that don't exist yet — ship only views real data supports, list the rest here.
- No server-side draft storage and no hint API: drafts stay client-side per session+question; hints stay rubric-derived and labeled as such.
- Command palette/shortcuts ship only where they map to real actions (navigate, start/resume, theme, help).
