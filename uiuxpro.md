# MASTER PROMPT: World-Class UI/UX Overhaul of the AI Interview Coach (Mobile + Desktop)

## 0. Mission and rules

You are a principal product designer and staff frontend engineer working inside this repository with file, shell and (if available) browser tools. Turn this existing, working AI Interview Coach into a calm, precise, unmistakably crafted product that students want to open every day for placement and technical-interview prep. Implement it in this codebase: no mockups, no second frontend, no report-only answer.

Mobile and desktop are equal first-class targets, each designed for its own constraints (thumb reach, on-screen keyboard and safe areas vs. keyboard shortcuts, wide layouts and hover). Never just shrink one into the other.

Craft bar: Linear's speed and keyboard flow, Stripe docs' clarity, Things/Bear's calm, Duolingo's single obvious next step (without gamification). Match their craft, not their look; this product needs its own identity.

If rules conflict, prioritize: (1) don't break working behavior, data or security; (2) accessibility and honest data; (3) core-loop usability on both form factors; (4) performance; (5) visual polish; (6) token economy.

### Hard rules
1. Preserve backend APIs, auth, DB models, interview logic, question-bank integration and session lifecycle. Touch logic only when a UI fix truly needs it, minimally and backward-compatibly.
2. Real data only. No invented scores, streaks, activity, stats, testimonials or recommendations. No data means an honest empty state that points to the next step. If a desirable feature has no backend support, omit it and list it under "Follow-ups" in the final report; never fake it.
3. No fake states. Every spinner, timer, progress bar and status (typing, thinking, recording, transcribing, saving) must map to real application state.
4. Never expose secrets: no API keys or tokens in the UI, URLs, logs, storage or client bundles; mask displayed credentials; don't log answers or PII; self-host fonts; add no trackers.
5. No framework, auth or backend migrations; no major-version upgrades of core packages. Add a dependency only if it clearly beats what exists (one-line justification in the plan). Never run two libraries for the same job (UI, icons, forms, data fetching): theme what exists.
6. No decorative assets: no generated images, illustrations, Lottie/video, particles, animated or gradient backgrounds, or looping animation. Icons plus CSS only.
7. Safety: no destructive commands (DB resets, force-push, `rm -rf` outside build output); never edit or commit `.env*` or secrets; never discard the user's uncommitted work (commit or stash it first).
8. Never claim a check passed unless you ran it and it passed. Otherwise write "not verified" and why.

### Token economy
- Locate with grep/glob; read a file at most once unless you changed it. Use subagents/Task tool (if available) for read-only exploration and ask for summaries of 30 lines or fewer; make edits in the main thread.
- Build primitives once and reuse them; no copy-pasted variants; keep files under ~300 lines; patch instead of rewriting whole files.
- Run lint/type/build quietly and read only the tail. Chat updates: 3 lines per phase. Details go in the plan file.
- Screenshots come from a script into `.uiux/shots/` (gitignored). View at most ~6 per phase, at 390, 768 and 1440 px. Check everything else programmatically.
- If the same failure survives 3 attempts, log it under "Known issues" and move on.

### Autonomy and persistence
- Don't ask what the code can answer. If something is ambiguous, pick the simplest option that satisfies this contract, log it under "Decisions" and continue. Ask the user only when blocked by missing credentials or a choice that could break data.
- First action: create `UIUX_PLAN.md` with a digest (60 lines or fewer) of §2–§6, the route inventory, the phase checklist, Decisions, Known issues and Follow-ups. Mirror the phases in your todo list. Re-read the plan at the start of every phase and after any context compaction or restart, then continue from the first unchecked item.
- Work on branch `feat/uiux-overhaul`; commit after every phase (skip only if this is not a git repo). Follow the conventions in AGENTS.md.

## 1. Phase 0: recon and baseline

1. Read AGENTS.md, README, `package.json` scripts, routing, layouts, global styles, components, API client, auth, state/data layer and tests.
2. Baseline: install, then run lint, typecheck, tests and build. Record pre-existing failures so regressions are attributable.
3. Run the app. Write a dev-only sweep script (`scripts/uiux-sweep.mjs`, Playwright if available or installable) that, for every route × viewport (320, 360, 390, 768, 1024, 1280, 1440, 1920; touch emulation on mobile sizes), records console errors/warnings and page errors, detects horizontal overflow (`documentElement.scrollWidth > clientWidth`), runs axe-core, and saves screenshots on request. For authenticated routes use the app's own dev login, seed or sign-up with credentials from gitignored env vars; never hardcode credentials. If no browser can run, say so and rely on code review plus the checks that can run.
4. Capture "before" screenshots (390 and 1440 only).
5. Fill the plan: route inventory (route → file → purpose → data → loading/empty/error present or missing), the 10 worst UX defects ranked by impact on the core loop (setup → interview → debrief), and a dead-control list (grep for `href="#"`, empty/TODO handlers, `console.log`, unlabeled icon buttons, duplicate pages masking broken routes).

## 2. Design contract: "Calm precision"

**Identity.** An editorial, high-trust study tool: warm paper surfaces, ink text, one cobalt accent, a serif only where it earns attention (interview questions, major headings), generous whitespace, hairline dividers, few surfaces. It must not look like a default component-library or AI-dashboard template: customize tokens, type and radii, and give each key screen one signature detail (§5).

**Themes.** Workspace (dashboard, practice, history, settings), landing and auth: light by default. Studio: dark "stage" by default. Settings offers System / Light / Dark; an explicit choice is honored everywhere, including the studio. Resolve the theme before first paint (cookie or inline script, no flash); set `color-scheme` and a matching `theme-color` meta.

**Starter tokens** (OKLCH, defined once as CSS variables and mapped into the Tailwind theme; keep unless brand or contrast requires a change; verify AA programmatically; precompute sRGB fallbacks if the browserslist needs them):
- Light: bg `oklch(0.985 0.004 85)`, surface `oklch(1 0 0)`, sunken `oklch(0.965 0.006 85)`, line `oklch(0.9 0.006 85)`, text `oklch(0.2 0.02 265)`, muted `oklch(0.46 0.015 265)`, accent `oklch(0.52 0.19 262)`, on-accent white.
- Dark: bg `oklch(0.16 0.012 265)`, surface `oklch(0.2 0.014 265)`, raised `oklch(0.25 0.016 265)`, line `oklch(0.3 0.016 265)`, text `oklch(0.96 0.004 265)`, muted `oklch(0.72 0.012 265)`, accent `oklch(0.74 0.14 262)`, on-accent `oklch(0.16 0.012 265)`.
- Semantic: success (hue 155), warning (hue 80), error (hue 25), info = accent. Status is always icon + text, never color alone.
- Accent covers at most ~5% of any screen: primary button, selection, focus ring, progress, links. One primary button per view.

**Type.** UI: Geist variable (or the project's existing sans if already good). Questions and large headings: one variable serif (Newsreader, Source Serif 4 or Instrument Serif). Code: Geist Mono or JetBrains Mono. Self-host via the framework's font optimizer or fontsource; latin subset; `font-display: swap`; size-adjusted fallbacks so nothing shifts. Scale in rem: 12-13 caption, 14 small, 16 body (minimum on mobile), 18 lead, 20 h3, 24-28 h2, 32-40 h1, fluid display `clamp(2.5rem, 6vw, 4.5rem)`. Line-height 1.6 body, 1.15-1.25 headings; tracking -0.01 to -0.02em on large sizes; tabular numerals for metrics and timers; prose 60-75ch.

**Space and shape.** 4px base: 4/8/12/16/24/32/48/64/96. Gutters 16/24/32 (mobile/tablet/desktop); section gaps 32/48. Radii: 8 controls, 12 cards, 20 sheets, full for pills. At most two elevation levels per screen; hairline borders; soft shadow only for popovers and sheets. No card-in-card, rainbow cards, glassmorphism, neon or heavy gradients. Cards only for discrete objects (a session, a topic, a question). One icon set at 16/20/24px with consistent stroke; no emoji as UI.

**Microcopy.** Sentence case. Buttons are verb + object ("Start interview", "Submit answer"). Plain, warm, specific; no hype or exclamation marks. Errors say what happened and what to do next. Format dates and numbers with `Intl` in the user's locale.

**Anti-generic test (apply to every screen before moving on):** exactly one primary action; hierarchy survives a squint; it doesn't resemble a default template; every element has a purpose; copy is specific to this product.

## 3. Platform playbook

**Mobile (320-767).** Design at 390 first; verify 320 (reflow) through 430.
- Viewport `width=device-width, initial-scale=1, viewport-fit=cover` (never disable zoom). Use `dvh`/`svh`, never bare `100vh`; pad with `env(safe-area-inset-*)`.
- Navigation: bottom tab bar, 5 destinations or fewer mapped to existing routes (e.g., Home, Practice, Start, Progress, You), 56px plus safe area. The center "Start" opens a quick-start sheet (presets, plus "Resume interview" when a session is active). The bar hides inside the studio and while the keyboard is open.
- Overlays: dialogs become bottom sheets (max 90dvh, scrollable body, sticky footer actions, drag handle plus an explicit close button; Android back closes the topmost sheet before leaving the page).
- Thumb zone: primary actions sit in a sticky bottom action bar (48px, safe-area padded); destructive actions are never adjacent to primary ones.
- Inputs: font 16px or larger (no iOS zoom), correct `type`/`inputmode`/`autocomplete`/`enterkeyhint`, visible labels (not placeholder-only), targets 44px or larger with 8px or larger gaps, `touch-action: manipulation`.
- Keyboard: the composer tracks `visualViewport` so the caret and Submit stay visible with no layout jump; chrome collapses while the keyboard is open.
- Scrolling: one scroll container per screen; `overscroll-behavior: contain` in sheets and the composer; accidental pull-to-refresh or back-swipe must never destroy an active interview.
- Tables become stacked rows, filters move into a sheet, charts reduce to sparkline plus list. Hover styles only under `@media (hover: hover)`. Short or landscape viewports collapse studio chrome; nothing essential is hidden.

**Tablet (768-1023).** Icon rail plus one or two columns; touch targets stay 44px or larger; centered dialogs instead of sheets.

**Desktop (1024 and up).**
- Collapsible sidebar (240px to 64px rail, preference persisted), 6 top-level items or fewer, user menu at the bottom.
- Content widths: 1200 dashboards, 720 reading and forms, 1120 studio. Extra width becomes a secondary column, never stretched text. Verify 1280, 1440 and 1920.
- Command palette (`Ctrl/Cmd+K`): navigate, start interview/drill, resume active session, switch theme, shortcut help (`?`). Shortcuts: `Ctrl/Cmd+Enter` submits an answer; `Esc` closes overlays only and never ends a session. Show shortcuts with `Kbd` in tooltips. Never override browser or OS shortcuts, and never fire single-key shortcuts while typing.
- Keyboard-reachable tooltips on icon-only buttons; hover, focus-visible and active states on every interactive element.
- Two-pane studio; side-by-side answer and feedback in the debrief.

## 4. Stack and building blocks

**Stack rules.** Keep the existing framework, router, data layer and backend. Before using any library API, check the installed version and read its current official docs (Context7/docs MCP, web, or the package's own types/README); never code from memory. New packages: latest stable. Use the framework's idioms for shells and states (e.g., Next.js route groups plus `loading`/`error`/`not-found` files; React Router layouts plus lazy routes). Tailwind: use the project's major version (v4: CSS-first `@theme`; v3: `tailwind.config` reading the CSS variables). If the project has a component library, theme it; if none, adopt shadcn/ui (copy-in components on Radix) as the single library. Strict TypeScript, no `any`, no magic numbers (tokens only), no duplicate components.

**Prefer the library's current registry over hand-rolling** (check its CLI/docs for what exists): dialog, sheet, drawer, command, tabs, accordion, tooltip, sonner, form/field, empty, spinner, kbd, button-group, input-group, chart. Restyle after installing; never ship default styling.

**Build once, reuse everywhere:**
- Primitives: Button (primary/secondary/ghost/destructive; loading keeps its width), IconButton (aria-label required), Input/Textarea/Select/Checkbox/Switch/Segmented, Field (label + hint + error wiring), Status badge (icon + text), determinate Progress, Tabs, Accordion, Tooltip, Toast (non-critical confirmations only).
- Shells: AppShell (sidebar/rail/tab bar plus active-session bar), StudioShell, AuthShell, MarketingShell, PageHeader, Section.
- Patterns: ResponsiveDialog (dialog from 768, sheet below), ConfirmDialog (states the consequence in plain words), StateView (loading/empty/error/offline/unauthorized with retry), skeletons that match final layouts, FilterBar (chips on desktop, sheet on mobile, URL-synced), lazy CommandPalette, ThemeSwitcher, ListRow, TopicMap, single-flight AsyncButton.

## 5. Screens

Improve every screen that exists (map the names below to real routes). Don't invent new pages unless the core loop is broken without them. Fix broken routes rather than adding duplicates.

### 5.1 Live interview studio (highest priority; make it exceptional)

Desktop layout:

+--------------------------------------------------------------------+
| [End]       Question 3 of 8        12:40 | Draft saved | [menu]    |
| ================ progress (thin, determinate) ==================== |
+----------------------------+---------------------------------------+
| INTERVIEWER                | YOUR ANSWER                           |
| Question (serif 28-32px)   | [ large auto-grow textarea, >=40vh ]  |
| topic, difficulty (real)   |                                       |
| earlier turns (collapsed)  | [mic] status, 42 words   [Submit]     |
+----------------------------+---------------------------------------+

Mobile layout:

[X]   3 / 8                          12:40
============== progress ===============
Question (serif 22-24px). Scrolls and
collapses to 2 lines while the keyboard
is open.
---------------------------------------
[ answer textarea, auto-grow          ]
[mic]   42 words          [ Submit ]  <- sticky above keyboard,
                                         safe-area padded

- The question and its number dominate. Interviewer turns and candidate answers are distinct by alignment, label and surface (not just color). Code in questions renders in mono with internal horizontal scroll.
- Answer area: large auto-grow textarea (max-height with internal scroll), clear focus, word count, `Ctrl/Cmd+Enter` to submit. If answers may contain code, offer a mono toggle; never trap Tab.
- Voice (if supported) mapped to real state: idle, requesting permission, recording (real elapsed time), uploading, transcribing, review (editable transcript unless the existing flow auto-submits), submitted. Handle denied permission (how to enable, and keep typing), no device, unsupported browser (hide mic, explain), and upload failure (retry without re-recording while audio is held). Stop all media tracks on stop and unmount.
- Integrity: single-flight submit (ref lock plus disabled state; ignore repeated shortcuts; idempotency key if the API supports it). Disable actions while their request runs and show the reason. Confirm End/leave (router guard plus `beforeunload`), stating exactly what happens to progress.
- Drafts: debounced (500ms or more) autosave per session and question to local storage, restored on reload, cleared after a successful submit. "Draft saved" text in a polite live region, no flashing.
- Errors: inline banner with Retry; never clear typed text. Distinguish network, expired auth (re-login, return with the draft intact), server and validation errors. Show an offline banner when `navigator.onLine` is false.
- Continuity: restore the session after refresh or back-navigation where the architecture allows (server state or session id in the URL, else a local snapshot, else a clear explanation). Anchor the timer to the real session clock; `role="timer"`; announce only at thresholds. An unfinished session shows a persistent "Resume interview" action on the dashboard and in the nav.
- A11y: a live region announces recording, transcribing, submitted and next question; focus moves to the new question heading; everything is keyboard-operable.
- Performance: composer state stays local (never in global state, context or URL); memoize question and turn components; no heavy markdown or syntax rendering per keystroke; no backdrop blur or large shadows.

### 5.2 Dashboard
Answers instantly: what next, how ready, what recently, what weakest.
- "Next up" panel with one primary action, chosen from real data in this order: unfinished session ("Resume interview"); weakest topic with enough attempts ("Drill {topic}" with a reason line such as "3 answers, average 4.1/10"); untested topic for the target role; otherwise "Start a 10-minute warm-up". Always show why.
- Readiness for the target role only if the backend provides it or a simple, explainable aggregate of real scores is possible (e.g., recency-weighted mean per topic). Show the evidence count and a "How is this calculated?" explanation; otherwise "Not enough data yet: complete N answers".
- Topic map (signature): a compact grid of topics, each tile untested / needs work / developing / strong, derived from real attempts, using one accent in tints plus icon and label; tap to drill that topic. Thresholds come from the existing score scale; log them in Decisions.
- Recent rounds (5 or fewer: date, type, AI-assessed score, Review link); resume and target-role status with edit links.
- New users: a checklist from real status (role, resume, first interview) that disappears as items complete.
- Mobile order: resume/next up, topic map, recent, status. Desktop: main column plus side column.

### 5.3 Interview setup
- Goal: first interview in under 60 seconds. Presets (e.g., quick warm-up, standard round, deep dive) only prefill existing parameters. Remember the last-used config as defaults (client-side) and persist the draft config across refresh.
- Visible by default: role, level, type/topics. Everything else (count, duration, difficulty, resume-based mode, job description) sits under "Advanced". Conditional fields appear only when relevant (resume-based without a resume shows an inline upload prompt, not a dead end).
- Live summary (desktop: sticky side panel; mobile: sticky bottom bar) with the Start button. Block invalid combinations with an inline explanation next to the field, never a silently disabled button.

### 5.4 Feedback and debrief
- Header: round, date, duration, overall score labeled "AI-assessed" with a short "How scoring works" explanation (use the backend's rubric if provided; don't invent one).
- "Fix first" (signature): the single highest-impact insight from real feedback (e.g., the most important missing point of the lowest-scoring answer) with one action: Retry question (if supported) or Drill topic.
- Topic strengths and weaknesses; per-question accordion (collapsed: question, score, status icon; expanded: your answer, what you got right, missing or incorrect, stronger answer, concept refresher). Desktop: answer and feedback side by side. Mobile: tabs (Your answer / Feedback / Stronger answer).
- Communication feedback only if the backend reliably provides it. Charts only where they carry real information, each with a text alternative. Next steps: 3 actions or fewer.
- While evaluation is pending, show the real status and allow leaving; results appear in history when ready.

### 5.5 Question bank and drills
- Categories, working search (debounced, abortable), filters (topic, difficulty, source, status), sort, server-side pagination or "Load more". Sync filters to the URL so back, refresh and share work. Row: title, topic, difficulty (icon + text), provenance (source-backed / adapted / AI-generated) only where the data carries it, per-user status from real progress.
- Preserve question identity; never show duplicates as new. "Start drill" for the current topic or filter. Clear empty and no-results states with "Clear filters".

### 5.6 Resume and project prep
- Status state machine: none, uploading, parsing, ready or failed (reason plus retry/replace). Show filename, size, date and "Used for: resume-based interviews, target role X". Replace and Remove (confirmed). Show extracted data only if the backend returns it.
- Drag-and-drop on desktop, native picker on mobile. Pre-validate type and size with the server's limits and explain rejections in plain words.
- "Project deep-dive" opens setup with resume-based mode preselected. Never invent project details.

### 5.7 History and progress
- History grouped by date, filterable by type; each row opens its debrief; "Load more"; empty state.
- Progress: score trend only with 3 or more real data points; topic coverage; practice frequency from real timestamps. No gamified extras unless they already exist.

### 5.8 Landing
- Above the fold: one headline (12 words or fewer), 1-2 supporting lines, one primary CTA, secondary "See how it works". Product preview built from real components using one clearly labeled "Example" fixture isolated in its own file.
- Sections: how it works (configure, practice, feedback, track), what feedback looks like, honest facts about resume and credential handling, FAQ, closing CTA, real footer links. No testimonials, invented stats or unsupported claims; pricing only if it exists.
- Mobile: sticky CTA after the hero, nav as a sheet, no horizontally scrolling sections.

### 5.9 Auth and onboarding
- Focused single-column forms (400px or narrower): visible labels, inline validation tied to fields, show/hide password, loading states, plain-language errors, email preserved on error, paste and password managers allowed, correct `autocomplete`, no autofocus on mobile. Keep all existing providers and credential requirements.
- Onboarding: 3 steps or fewer with "Step n of N", Back, Skip where allowed, progress persisted across refresh, no re-asking known data. If users supply their own API key: explain why and where it is stored, how to get one, mask it, and offer "Test connection" only if an endpoint exists. Finishing lands in setup with defaults prefilled.

### 5.10 Settings and everything else
- Grouped: Profile, Target role and defaults, Resume, API credentials (if applicable), Appearance, Data and privacy, Danger zone. Mobile: list to detail. Desktop: side nav plus content. Confirm destructive actions with plain-language consequences.
- 404, error and offline pages that lead the user back. Any other existing route gets the same treatment; none is skipped.

## 6. Cross-cutting quality

**States.** Every async view defines: loading (skeleton only after ~200ms; stale data stays visible while refreshing), empty (reason plus next action), error (what, why, retry), offline, expired auth (re-login and return), partial failure (section-level boundaries so one widget never blanks a page). Every mutation defines: pending (spinner replaces the icon, label width kept), success, inline failure with inputs preserved, and a double-submit guard. Add route-level error boundaries.

**Forms.** Use the existing form library, else React Hook Form + Zod. Validate on blur and submit; hint text before error text; `aria-invalid` plus `aria-describedby`; focus the first invalid field; never wipe input on failure; explain why an action is unavailable instead of silently disabling it.

**Accessibility (WCAG 2.2 AA).** Semantic HTML first, ARIA only to fill gaps. Landmarks, skip link, one h1 per page; on route change move focus to the h1 and update `document.title`. Text contrast 4.5:1, UI components and focus indicators 3:1, focus ring 2px or larger on every theme. Targets 44px or larger (never under 24px). Sticky bars never obscure focused elements (`scroll-padding`/`scroll-margin`). Dialogs trap focus, close on Esc and return focus. Drag interactions have a non-drag alternative. Never re-ask known info; allow paste and password managers. Polite live regions for status; assertive only for blocking errors. Works at 320px reflow, 200% zoom and text-spacing overrides; honors `prefers-reduced-motion`; borders and focus stay visible in `forced-colors`.

**Motion (functional only).** 120-240ms, `cubic-bezier(0.2, 0, 0, 1)`, animating `opacity` and `transform` for hover/press, dialogs and sheets, and progress (`scaleX`); expand/collapse may use the `grid-template-rows: 0fr to 1fr` technique. No route animation (or 150ms opacity at most), no decorative or looping motion. Reduced motion means opacity only or none.

**Performance (measure on a production build with mobile emulation and CPU throttle).** Targets: LCP 2.5s or less, INP 200ms or less, CLS 0.05 or less. Route-level code splitting; lazy-load the palette, charts and markdown/code highlighting; import icons individually; hand-rolled SVG/CSS for sparklines and bars (a chart library only for something complex, lazy-loaded). No request waterfalls; dedupe requests; debounce search 250-300ms; abort stale requests; pause polling when the tab is hidden; prefetch primary routes on intent. Virtualize only lists over ~200 rows; `content-visibility: auto` for long off-screen sections; `scrollbar-gutter: stable`. Keep state local and colocated. Report real numbers or "not measured".

**Polish checklist (final pass).** Optical alignment on the 4px grid; skeletons match final layouts; long text wraps (`overflow-wrap: anywhere`) or truncates with access to the full text; tabular numerals in timers and tables; `::selection`, caret and native controls follow the theme; empty states are icon + title + one sentence + action; every disabled control explains itself; consistent `:focus-visible` rings; no layout shift from theme change, scrollbar appearance or font load.

## 7. Phases and gates

P0 Recon and baseline (§1) → P1 Foundations (tokens, fonts, theme-before-paint, shells, nav, primitives, patterns, global CSS for viewport, safe-area, focus and reduced motion) → P2 Core loop (Studio first, then Setup, Dashboard, Debrief) → P3 Learning system (question bank and drills, resume, history and progress) → P4 Entry and account (landing, auth, onboarding, settings, 404/error) → P5 Hardening → P6 Verification and report.

**Gate for P1-P4 (must pass before the next phase):**
a. Typecheck, lint and build show no new failures vs. baseline; tests pass.
b. Sweep on that phase's routes at all 8 viewports: 0 console errors or warnings, 0 horizontal overflow, 0 serious or critical axe issues.
c. View at most 6 screenshots (390/768/1440) and critique them against the anti-generic test (§2) and the polish checklist (§6); fix weak spots now.
d. Update the plan; commit `feat(uiux): <phase>`.

**P5 Hardening:** keyboard-only pass through the core loop; dead-control sweep (§1 list) with everything fixed or removed; delete superseded components and styles once grep shows zero references; 200% zoom and reduced-motion checks; slow-network and offline check for the studio (draft preserved, retry works); Lighthouse mobile on a production build (record accessibility with a target of 95 or higher, performance and the Core Web Vitals); one full sweep over every route.

**P6 Verification:** run lint, typecheck, tests and the production build, plus end-to-end journeys on one mobile and one desktop viewport: sign-up → onboarding → setup → live interview (answer, follow-up, submit, end) → debrief → history → drill. If the live interview needs paid credentials you don't have, use the app's dev/mock mode or network fixtures in tests only, and state that the real end-to-end was not verified. Finally, append a "UI conventions" section (30 lines or fewer: tokens, shells, primitives, rules) to AGENTS.md so future sessions stay consistent.

## 8. Done and final report

Done means: all gates passed or documented; no dead controls; every route has loading, empty and error states; no console errors; no horizontal overflow at any viewport; axe clean on serious and critical issues; the studio is fully keyboard and screen-reader operable; no fabricated data; lint, types, tests and build are no worse than baseline.

Final report (250 words or fewer): (1) major UI/UX improvements; (2) routes and components changed; (3) bugs fixed; (4) responsive and accessibility improvements; (5) checks actually run, with results; (6) not verified, Known issues, Follow-ups.

Begin Phase 0 now and continue through Phase 6 without waiting for confirmation
