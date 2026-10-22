# AI Interview Coach — Product Specification & Master Antigravity Prompt

**Status:** Product discovery complete through Question 86  
**Purpose:** Use this specification to evolve the existing Telegram AI Interview Coach into a polished, production-minded, interview-first web product while preserving its working backend.  
**Working product name:** AI Interview Coach (do not rename existing services, bot identity, database tables, or project assets without inspecting the repository and confirming the implications).

---

# Part I — Product specification

## 1. Product vision

Build a premium, responsive AI placement-preparation companion for engineering students and early-career candidates, with the **voice interview studio as the core experience**. The product must feel like a thoughtful one-to-one interviewer and coach, not a generic chatbot wrapped in a dashboard.

The product's differentiator is structured, persistent, adaptive preparation: it remembers what the candidate has demonstrated, probes important claims, identifies genuine weaknesses, supports targeted revision, and provides evidence-backed debriefs. Its value is not merely generating explanations; it is helping students practise answering, defend their projects, understand gaps, and verify progress independently over time.

### Main product principles

1. **Interview first.** Build a reliable turn-by-turn voice interview experience before investing in real-time streaming or coding execution.
2. **Honest evaluation.** Scores must be supported by evidence. An unanswered question, an uncertain transcript, and a technically incorrect answer are different states.
3. **Personalisation without invention.** Use candidate-confirmed resume information and the actual interview conversation. Never fabricate experience, accomplishments, project ownership, sources, or what a candidate said.
4. **Privacy by design.** The application must never retain raw audio or video. Any necessary audio processing is transient. Disclose what is processed and what external providers receive before the first voice session.
5. **Candidate agency.** Students can stop, retry, skip, resume, correct transcripts, challenge evaluations, and delete saved interview history.
6. **Adaptive but predictable.** The interview can react to answers, but candidates should know the intended question categories, duration, difficulty baseline, and evaluation approach.
7. **Reuse before rewrite.** Preserve the existing working Python/FastAPI backend, Telegram bot, SQLite data, Groq integrations, and Tavily integration wherever viable. Audit before changing architecture.
8. **Accessible and responsive.** Design desktop-first with an excellent mobile experience—not a desktop page merely squeezed onto a phone.

## 2. Target users and jobs-to-be-done

Primary users are engineering students preparing for internships, campus placements, fresher roles, and early-career technical interviews, especially in India.

They need to:
- practise speaking answers aloud, rather than only reading explanations;
- simulate HR, technical, project-defence, and mixed interviews;
- receive fair evaluations of content separately from spoken delivery;
- understand why an answer was weak and how to improve it;
- rehearse resume claims and defend project decisions;
- prepare for a company and role using a job description, curated questions, candidate information, and current reliable research when useful;
- revisit weak areas with varied questions and later verify independent mastery;
- review progress without believing that an AI score guarantees hiring success.

## 3. First-release scope and roadmap

### Release 1 — interview-first

Build and integrate:
- Clerk authentication with Google sign-in.
- Mandatory Groq API key setup and server-side validation before proceeding into the application.
- Mandatory resume upload and parsing before the dashboard is accessible.
- Candidate profile review/correction and short conversational placement setup.
- Premium responsive dashboard.
- Turn-by-turn voice interviews and text practice/fallback.
- Realistic simulation mode and Practice/Coaching mode.
- Adaptive follow-ups, question quality checks, transcript confidence handling, scratchpad, interruption controls, recovery, and partial interview completion.
- Evidence-based interview debrief with role-aware scoring, transcript evidence, improved examples, retries, and disputed-feedback reassessment.
- Progress/readiness indicators that separate independent performance from assisted practice.
- Current-company preparation using vetted question banks, resume/job description, and Tavily research when relevant.
- Supporting lightweight placement tracker and adaptive preparation roadmap, without letting these features displace the interview studio as the main product priority.
- Optional Telegram account linking. Website remains the primary product; Telegram remains a lightweight daily companion.

### Later releases — do not block Release 1

- Real-time streamed voice conversation, voice-activity detection, natural barge-in, echo/noise safeguards, and interruption recovery beyond explicit Stop Speaking.
- Interactive coding rounds with Java and C++, using a hosted isolated execution API (for example, Judge0) behind a replaceable adapter; do not execute arbitrary code on the application server.
- Full code editor, architecture diagram canvas, and advanced coding/diagram tools.
- Multi-interviewer panel simulation.
- Upgraded third-party TTS if browser-native speech synthesis is not adequate.

Do not represent later-release features as working in the first release. Keep interfaces/abstractions future-ready without building speculative complexity prematurely.

## 4. Authentication and mandatory onboarding

### Access rules

- No guest access to the application.
- No demo interviews, guest AI previews, or AI features before sign-in, Groq key validation, and mandatory resume onboarding are complete.
- A public landing page may communicate product value and show a static/non-interactive visual of the interviewer, but it must not provide a working interview or bypass onboarding.
- Use Clerk with Google sign-in as the initial authentication path, using the current official integration appropriate to the existing Next.js version. A globally installed CLI is not a substitute for correctly integrated authentication.

### Onboarding order

1. **Sign in with Google via Clerk.**
2. **Groq key is the first setup priority after sign-in.** Explain why it is needed. Accept the student's own Groq API key, validate it safely, and block further app access until a valid key is configured. Never ask the user to paste secrets into Telegram or support chat.
3. **Resume is mandatory.** Accept PDF and DOCX. Parse it and show clear errors if the document is empty, unreadable, corrupt, or unsupported. The student must replace/retry an invalid resume before entering the dashboard.
4. **Review extracted profile.** Show a concise, editable summary of skills, projects, tools, experience, and achievements. Flag uncertain extraction and important ownership claims. Allow correction/removal without asking the student to verify every line.
5. **Conversational preparation setup.** Ask what the student is preparing for. Infer target role, company (if any), level/seniority, target date, and interview type from natural language. Ask only for essential missing information. Summarise the inferred details and allow correction.
6. **Create the initial preparation roadmap and open the dashboard.** Keep the roadmap visible and adaptive, but subordinate to voice interview practice.

### Groq key handling

- The key belongs to the student and is required before app use.
- Send the key from the browser to the backend over HTTPS only.
- Validate it with a minimal safe request. Do not reveal the key in validation errors.
- Encrypt it at rest using authenticated encryption and a dedicated server-side key from environment configuration. Use an established, maintained library; never invent cryptography.
- Never store plaintext API keys in SQLite, Clerk metadata, browser localStorage/sessionStorage/IndexedDB, URLs, analytics, crash reports, Telegram messages, or logs.
- Never return the plaintext key to the client after the initial submission. Display only a configured status and a masked hint where safe. Provide change/remove controls.
- Redact secrets from structured logs, exceptions, traces, and request bodies. Keep the encryption key separate from the database. Document safe key rotation and backup implications.
- Do not allow a request to use another user's key. All records and decrypted credentials must be scoped to the authenticated identity.

## 5. Technical architecture

### Preserve the existing backend

The known existing stack includes:
- Python 3.12 backend using FastAPI;
- asynchronous `python-telegram-bot` polling;
- SQLite with `aiosqlite`;
- Groq SDK and candidate-provided Groq keys encrypted at rest;
- speech-to-text using Groq Whisper (reported model: `whisper-large-v3-turbo`), where currently implemented;
- LLM evaluation using Groq (reported model: `openai/gpt-oss-20b`), where currently implemented;
- Tavily key in server environment, not supplied by students;
- existing resume parsing, question-bank, daily question/reminder, mock interview, progress, and web-search capabilities.

These are audit targets, not permission to assume every file is correct. Antigravity must first inspect the current repository and verify which integrations are truly implemented and working. Preserve working flows. Do not replace the backend wholesale, create a parallel database, or remove a feature because a rewrite seems easier.

### Web stack

- Next.js App Router + TypeScript.
- Tailwind CSS.
- shadcn/ui as the primary accessible component foundation.
- Motion for React (or the compatible Motion package already used) for purposeful transitions.
- Lucide icons.
- Use Magic UI, Aceternity UI, React Bits, or 21st.dev selectively for individual components only where they materially improve the design; do not install everything or create competing design systems.
- Clerk integration using current supported documentation for the installed framework version.
- Existing Python/FastAPI service remains the shared API and source of truth.
- SQLite remains the initial source of truth unless the audit proves a compelling reason to migrate; any migration must be planned, tested, reversible, and preserve existing data.

### Integration model

- The website and Telegram bot share user-linked learning records through the existing backend and database when the user explicitly links accounts.
- Website is primary. Telegram provides lightweight daily questions, reminders, quick text practice, and concise progress/next-action updates. It is not a clone of the full interview studio.
- Linking must use a short-lived, one-time, single-use linking code; rate-limit the flow. Do not link by guessing Telegram usernames or email addresses.
- Never send the Groq key to Telegram or expose it in a bot message. Avoid making bot features depend on handling the secret in chat.
- Use one canonical identity mapping and ownership checks. Explain what data is shared when linking.

### Deployment direction

The intended deployment is simple, initially on EC2, behind Nginx with HTTPS via Certbot and an available `sslip.io` hostname if no domain has been obtained yet. Do not create elaborate infrastructure or introduce Redis, Kubernetes, multiple databases, or extra cloud services without a demonstrated need. Keep the backend, website, and Telegram process deployment instructions explicit. Do not deploy or change live production resources unless requested.

## 6. Visual and interaction design

### Design direction

Premium editorial/productivity aesthetic: warm, focused, polished, and technically credible. Avoid a generic template made of identical cards, excessive gradients, loud gamification, or decorative animations without purpose.

Suggested design tokens:
- Warm ivory workspace: `#F4F1EA`
- Graphite text: `#20232C`
- Electric indigo action/accent: `#5967F2`
- Interview-studio midnight: `#0B1020`
- Orb cyan: `#65D9F2`
- Success teal: `#168A72`

Use design tokens so colours can be tuned later. Ensure accessible contrast in light and dark contexts.

### Workspace vs interview studio

- **Workspace:** light/warm surfaces for dashboard, resume/profile setup, coaching, reports, history, tracker and settings.
- **Interview studio:** immersive dark, fullscreen-capable environment with one glowing animated orb, question text, voice state, compact controls and minimal distraction.
- No human avatar or cartoon character. The orb is the interviewer visual identity.
- Orb states: `idle`, `listening/recording`, `thinking`, `speaking`, `paused/error`. The states must correspond to real app state; never show “thinking” after a response is already available or claim a task completed when it is still processing.
- Use restrained voice-reactive animation where a reliable signal exists. Do not pretend to derive live audio amplitude if the browser/provider does not provide it.
- Desktop navigation: collapsible sidebar. Mobile navigation: clear bottom navigation and responsive layouts. The interview studio should remain distraction-free and usable on narrow screens.
- Purposeful Motion animations only. Respect reduced-motion preferences and avoid animation that interferes with controls, reading, focus, or mobile performance.
- All components must have loading, empty, error, success, disabled, and mobile states where applicable.

### Primary dashboard

The dashboard is a rich placement command centre, but the interview experience remains the main CTA and the product centre of gravity. Show useful, evidence-backed information such as:
- next recommended interview/practice action;
- recent interviews and resume status;
- topic mastery/weak areas;
- overall readiness indicator with confidence/evidence context;
- role/company-specific readiness only when sufficient evidence exists;
- progress trend across unassisted and assisted attempts;
- upcoming prep actions/deadlines where available;
- quick start for Practice, Realistic Simulation, Project Defence, and Company Prep.

Avoid unsupported hiring-probability claims or a precise readiness number built from insufficient data.

## 7. Interview modes and session setup

### Modes

**Realistic Simulation**
- Simulate a professional corporate interview.
- Hide the candidate's transcript by default and hide scores during the session.
- Show neutral progress only (question count, elapsed time, coverage status if appropriate).
- Do not teach or reveal the ideal answer during the interview.
- Answer procedural clarifications neutrally; rephrase ambiguous question wording without revealing a solution.
- Respectfully probe questionable claims with focused follow-ups and let the candidate defend/revise reasoning; reserve correction and scoring for the debrief.
- Automatically progress after a brief pause when the next question is ready, without talking over the student.
- On completion, provide the full debrief. If the interview ends early, provide an explicitly labelled partial debrief.

**Practice / Coaching**
- Show the editable transcript automatically and evaluate only after the student confirms/corrects it.
- After each submitted answer, speak a concise coaching summary and show detailed visual feedback.
- Show an evidence-based scorecard, missing points, an improved answer, explanation of why it is stronger, and a targeted-practice option.
- Offer an intelligent spoken retry where it would help; allow Retry or Continue. Score the retry separately and retain the original result.
- Hints and brief conceptual explanations are available. Record assistance used so it does not inflate independent-readiness evaluation.
- After the spoken summary finishes, wait for Retry or Continue; never interrupt the feedback or speak over the student.

### Interview length
Offer flexible durations:
- Quick: 5–10 minutes.
- Standard: 15–20 minutes.
- Full: 30–45 minutes.
Students may finish early and receive a partial debrief.

### Interviewer role/style
Offer:
- HR/behavioural;
- technical interviewer;
- hiring manager/project defence;
- mixed interview.
Keep the same orb and coherent voice; adapt question style, follow-ups, and rubric to the selected style.

### Question blueprint and categories
- Start with a role-, seniority-, interview-type-, and difficulty-aware blueprint.
- Show planned categories before starting and allow student customisation.
- Preserve essential topic coverage while allowing adaptive follow-ups.
- Use a mix appropriate to the role: technical fundamentals, reasoning/problem solving, project defence, behavioural/STAR, communication, and any role-specific domains.
- Normally ask one or two follow-ups where a knowledge gap, unsupported project claim, or promising reasoning warrants probing.
- Do not let probing consume the whole interview; track coverage and move on when appropriate.

### Difficulty calibration
- Use target role, seniority and selected difficulty as baseline.
- Calibrate from a few early answers.
- Gradually adjust challenge based on demonstrated understanding; one mistake should not make everything easy and one simple correct answer should not trigger an extreme jump.
- Preserve essential question coverage. Offer fixed difficulty for exam-like practice.

### Question-quality gate
Every question must pass validation before it is spoken:
- clear and unambiguous;
- appropriate to role, seniority, mode and difficulty;
- answerable in the expected duration;
- not a semantic duplicate of what was already asked unless it has a deliberate, documented purpose;
- mapped to a concept/topic and evaluation rubric;
- rubric supports valid alternative answers and distinguishes required from optional concepts;
- important factual assumptions are checked when needed;
- follows from the candidate's confirmed resume and context without inventing facts.

If a question fails, repair it or replace it with a vetted alternative. Never expose the expected answer while doing so.

### Interview-wide contextual reasoning
Maintain relevant technical claims, project details, assumptions and explanations across the session. When statements appear inconsistent, ask a neutral clarifying question, let the candidate explain, and use the resulting evidence in the final evaluation. Do not infer dishonesty merely from apparent inconsistency.

### Within-session deduplication
Track questions/concepts already tested and evidence collected. Avoid semantically duplicate questions. Repeat or revisit a concept only when the follow-up tests a genuinely different skill, clarifies a material gap, or verifies understanding. Explain repeated testing in the debrief when useful.

## 8. Voice experience and state machine

### Release 1: turn-by-turn voice

- Student records one answer, reviews/corrects when applicable, submits it, and waits for the next interviewer turn.
- Explicit Stop Speaking control immediately stops interviewer playback.
- Students can respond, replay, or continue after stopping playback.
- Do not implement unreliable always-listening/automatic barge-in in Release 1.
- Design adapters/interfaces to add real-time streaming, voice-activity detection and natural barge-in in a future release.

### Voice stack strategy

- Inspect and preserve the currently working audio capture and transcription path. The existing project reportedly uses Groq Whisper for STT; verify this before changing anything.
- Prefer the existing working STT provider through a clear interface. If browser-native recognition is also available, treat browser compatibility and data routing honestly; do not assume browser APIs are available or fully local on every browser.
- Begin with browser-native speech synthesis where supported for low-friction playback and user-selectable voice/speed. Encapsulate TTS behind an adapter so a higher-quality provider can be added later without rewriting interview orchestration.
- Present a small set of available English voices and a speed control; use a robust default. Voice delivery adapts to mode: professional/corporate simulation versus supportive coaching, without losing a coherent interviewer persona.
- If a specific browser voice feature is unavailable, clearly explain the problem and offer retry or text fallback. Voice functionality must never silently fail or block all practice.

### Required UI states
At minimum:
1. `idle` — ready to begin or accept an action;
2. `preflight` — checking mic permission/playback/STT availability when first needed or after a problem;
3. `speaking` — interviewer audio is playing;
4. `listening/recording` — candidate capture is active, with obvious recording indicator and immediate stop;
5. `transcribing` — audio is being converted to text;
6. `confirming_transcript` — Practice mode review/correction, or Realistic mode if critical words are uncertain;
7. `evaluating/thinking` — actual processing in progress, truthful status text;
8. `feedback` — Practice coaching or end-of-interview debrief;
9. `paused` — session safely paused;
10. `recoverable_error` — plain-English reason and retry/text/resume options;
11. `completed` / `partial_completed` — interview ended normally or early.

Enforce legal transitions so playback and microphone capture do not unexpectedly overlap. Prevent duplicate submissions from repeated clicks/retries. Use a session/turn ID or idempotency strategy where useful.

### Preflight and transitions
- Check microphone permission, audio playback and STT availability the first time they are needed or after an error, not with a tedious repeated checklist before every question.
- Offer a quick test; any test audio must be transient and not saved.
- Show the current spoken question as concise text with replay. Let students collapse it.
- In Realistic mode keep the candidate transcript hidden by default, but allow request/reveal; Practice mode shows it automatically.
- Use truthful waiting messages such as “Reviewing your answer” or “Preparing a follow-up.” Add brief reassurance only after an unusually long wait. Do not use fake progress or claim the AI has finished prematurely.
- In Realistic mode transition after a brief pause to the next question/follow-up, with no scores shown. In Practice mode finish the spoken coaching summary first and wait for Retry or Continue.
- Use question-specific smart timing guidance and an unobtrusive timer. Gently warn when an answer becomes unusually long. Never end an answer automatically unless that round explicitly has a hard time limit.
- Patiently allow thinking time. After extended silence, Realistic mode may show a neutral prompt; Practice mode may offer a gentle prompt and optional hint. Silence alone is never scored as a wrong answer.

### Speech recognition fairness
- Preserve the originally recognised transcript and any user-corrected version as distinct fields/version history where needed.
- In Practice mode, show an editable transcript and do not evaluate until the candidate confirms/corrects it.
- In Realistic mode, hide transcript by default and keep the interaction flowing when recognition is clear; request a repeat/correction when important words are uncertain.
- Never finalise a score based on a known transcription error. Never claim a calibrated recognition confidence if the chosen provider does not supply one; use conservative uncertainty detection and human confirmation.
- A speech-recognition error must never count as poor technical knowledge or speaking skill.

### Interruption/recovery
- Explicit playback Stop control in Release 1.
- Persist each completed turn, transcript, question state, and interview session state securely. On browser refresh, network drop or reconnect, resume from the last confirmed turn.
- If the interruption was mid-answer, ask the student to repeat that answer instead of guessing what was said.
- For a mid-session voice failure, pause safely and offer retry voice or temporary typed input in the same interview. Preserve the interview plan and current question. If typed input is used, do not calculate speaking-delivery metrics from it.
- Confirm before ending an interview. Preserve completed answers for the debrief.

## 9. Audio/video privacy and consent — non-negotiable

**The application must never retain raw audio or video.** This is an absolute constraint, not a configurable preference.

Never write raw audio/video to:
- SQLite or another database;
- object/blob storage;
- application history or session records;
- browser localStorage, sessionStorage, IndexedDB or Cache API;
- persistent filesystem/temp directories beyond transient processing when unavoidable;
- logs, request-body dumps, analytics, crash reports or telemetry.

Implementation requirements:
- Prefer in-memory/transient processing or direct transient upload to the required speech provider.
- If a provider/library forces a temporary file, create it only for processing and delete it in a guaranteed cleanup/finally path on success, failure, cancellation, timeout and disconnect. Do not retain temp files as a retry mechanism.
- Stop MediaStream tracks and release browser audio buffers when capture stops or the interview is abandoned. Revoke object URLs and clear in-memory media references where feasible.
- Never retain video. Do not request camera permission for the first release unless a future, explicit feature truly requires it.
- Before the first voice session, explain what audio is captured, how it is transcribed, what the application saves, and whether audio is sent to a speech-processing provider. Obtain clear consent.
- Show an unambiguous recording indicator and provide an immediate stop control.
- Make no claims that a provider retains no audio or uses no data for training unless current, verified provider terms support that exact claim. Distinguish application non-retention from third-party processing/retention.
- Save only permitted derivative records such as the confirmed transcript, answer text, scores, feedback, timestamps, topic coverage, assistance used and progression state, subject to the student's history controls.
- Do not use recorded audio/video for training or analytics. No hidden microphone access.

## 10. Answer evaluation and scoring

### Adaptive role-aware rubric
Evaluate the relevant dimensions for the question type, which may include:
- technical correctness;
- reasoning and trade-off analysis;
- answer structure;
- relevance to the question;
- clarity and appropriate concision;
- supporting examples;
- depth and completeness;
- project ownership, architecture and decision reasoning;
- behavioural evidence/reflection, using STAR where appropriate;
- communication delivery separately from content.

Use anchored 1–5 ratings for each relevant dimension. Every rating needs evidence linked to the answer/question. Allow `insufficient_evidence` when a fair rating cannot be supported. Not every rubric dimension applies to every question.

### Technical correctness and sources
- Combine question-specific rubrics/expected concepts with context-aware AI evaluation and trusted references.
- Accept valid alternative explanations; do not require verbatim matching to a reference answer.
- Identify concrete errors and missing concepts.
- Verify important claims when uncertain or time-sensitive, rather than performing a live search for every answer.
- Clearly separate verified facts from subjective coaching advice.
- Provide contextual links to official documentation or reliable sources when correcting significant misconceptions, explaining complex concepts, or checking current information. Do not add a wall of links after every answer.

### Delivery coaching and fairness
- Assess reliably measurable pacing, excessive filler words, long pauses, answer structure and intelligibility when signal quality supports it.
- Separate delivery metrics from technical correctness.
- Coach grammar, word choice, filler words and pacing where useful.
- Never penalise accent, require native-like pronunciation, or infer intelligence/personality from accent or vocal traits.
- If a typed answer is used after voice failure, do not produce spoken-delivery scores for that answer.

### Answer improvement
- Highlight demonstrated strengths and missing points.
- Provide a stronger example grounded in the question, original answer, resume and confirmed project information.
- Explain why the revision is stronger and teach a useful structure (for example, STAR for behavioural answers).
- Never fabricate personal achievements, experience, metrics, ownership, technologies or project outcomes.
- Where useful, show a concise interview-ready version and/or explain a deeper version for follow-ups; preserve the candidate's authentic experience and voice.

### Assisted vs independent evidence
Track separately:
- original answer;
- transcript corrections;
- assistance/hints/explanations used;
- retries and retry scores;
- later unassisted answers.

Use independent answers as the strongest evidence of readiness. Assisted attempts count as learning progress, not equivalent independent proof. If a misconception persists, schedule a later unassisted retest with varied wording/scenario. Do not erase the initial result when a retry improves.

### Final assessment
- Role-aware, evidence-based score weighting.
- Show overall indicator only when enough evidence exists, alongside per-skill results, source evidence, question/topic coverage, unanswered items and assessment confidence.
- Do not manufacture numerical precision from sparse evidence.
- Distinguish unanswered questions, transcription uncertainty, insufficient evidence and technically incorrect answers.
- No hiring guarantees or unsupported hiring-probability claims.
- Realistic mode hides scores until the debrief. Practice mode reveals answer scores/feedback after each confirmed submission.

### Challenging feedback
- Students can flag a specific feedback point, explain what was missed, or correct transcription text.
- Reassess against the same rubric. Explain what changed and why. Retain original and revised evaluations in the record so the change is transparent.
- A rewritten practice response is a new attempt; it must not silently overwrite the original spoken-attempt score.

## 11. Interview debrief

Build an interactive, evidence-linked report:
- concise summary first;
- role-aware overall indicator (or explicit insufficient evidence);
- skill map and dimensions scored 1–5 where appropriate;
- assessment confidence and evidence coverage;
- question timeline and topic coverage;
- expandable evidence excerpts tied to relevant question/score;
- demonstrated points versus missing points;
- an improved answer and explanation of why it works;
- separate content/technical and spoken-delivery feedback;
- unanswered questions and missing coverage, never framed as incorrect answers;
- assistance used and clear distinction between assisted practice and independent readiness;
- targeted practice/next actions, including spaced revision;
- references when they genuinely support a correction or deeper learning;
- correction/reassessment history when the student disputes feedback.

If the student ends early, label the report `Partial debrief — interview incomplete`, show covered and missed topics, lower confidence when appropriate, and assess only completed evidence.

## 12. Resume, project defence and company preparation

### Resume and project defence
- Candidate confirms/edits a concise resume-derived profile before entering the dashboard.
- Project defence probes architecture, personal contribution, design trade-offs, testing, limitations, security and implementation details when relevant.
- Treat resume statements as candidate-provided claims unless independently verified. Ask the candidate to clarify uncertain/contradictory details; never presume dishonesty.

### Company/role preparation
Use a grounded hybrid of:
- curated interview/question bank;
- the student's confirmed resume/profile;
- a supplied job description or role requirements;
- current Tavily research only when relevant.

Clearly cite links and retrieval date/context for current facts. Distinguish sourced information from generated practice material. **Never promise that generated questions are actual or guaranteed company interview questions.** Cache responsibly and enforce usage/latency limits. Tavily credentials remain server-side and are never provided by students.

## 13. Dashboard, Coach, tracker and preparation plan

The dashboard is a rich placement command centre, but the interview studio remains the key product. Include:
- next recommended practice action;
- launch interview controls;
- recent sessions and interactive debriefs;
- evidence-based topic mastery and readiness;
- progress history that separates assisted vs independent evidence;
- adaptive roadmap/plan with reasons for changes and student overrides;
- a dedicated Coach workspace plus a compact contextual coach outside the active interview (never cover active interview controls);
- a lightweight placement tracker for company, role, status, deadlines and interview date, linked to preparation actions;
- manually add opportunities or paste a job link; extract company/role/requirements into a reviewable form before saving;
- desktop Kanban and mobile list plus clear next actions.

Do not spend disproportionate effort on the tracker/planner compared with the interview studio.

## 14. Telegram companion

- Website is the primary product; Telegram is a lightweight daily companion.
- Keep daily questions, reminders, quick text practice, concise progress and next-action summaries.
- When explicitly linked, share relevant learning history through the same backend/source of truth.
- Use a secure one-time linking flow; let the student unlink later.
- Never send the student's Groq key in Telegram or make it visible to the bot.
- Never turn Telegram into a duplicate full web interview studio.

## 15. Data, privacy and deletion

Persist only what is required for the product and according to user controls: profile, resume-derived/confirmed profile (and original resume only if the product's stated retention policy allows it), interview setup, questions, confirmed/corrected transcripts, typed answers, scratchpad entries, evaluation versions, assistance markers, progress, history and tracker records.

- Make the saved-history policy visible before the first interview.
- Save session history by default to support progress review.
- Allow deleting an individual interview and all interview history.
- Deleted data must be excluded from future personalisation and removed from relevant derived indexes/caches/embeddings, not merely hidden in the UI.
- Never retain raw audio or video, regardless of history preference.
- Enforce per-user ownership checks for all queries and mutations.
- Use database migrations that preserve current user data.
- Avoid returning sensitive resume/key data beyond what the UI needs.

## 16. First-release acceptance criteria

The implementation is not complete until all applicable points pass:

### Authentication/onboarding
- Unauthenticated users cannot access dashboard, Coach or interview APIs.
- Authenticated user without a valid Groq key is routed to key setup and cannot bypass it through a URL or API call.
- Invalid key produces a safe, actionable message with no secret leakage.
- Resume is mandatory before dashboard. Invalid/unreadable file stays in onboarding with retry/replace.
- Extracted profile can be corrected and corrections become the canonical interview context.
- Setup recognises missing fields, asks only essential questions, and offers a confirmation step.

### Interview flow
- Both modes work with real backend data; no fake/hard-coded demo responses.
- Question is shown on screen and can be replayed/collapsed.
- Correct orb state and status are displayed through every state transition.
- Stop Speaking immediately stops playback.
- Realistic mode hides scores until debrief and does not teach answers mid-interview.
- Practice mode shows/edit/confirms transcript before scoring, then presents spoken and visual coaching.
- Retry and Continue work; retries do not overwrite original attempts.
- Follow-ups are bounded, role-aware and deduplicated; question-quality gate is applied before the question is spoken.
- Skipped/unanswered, uncertain transcript, insufficient evidence and incorrect answer remain distinct.
- Timer guides, rather than interrupts, except in a clearly configured hard-timed round.
- Scratchpad appears for applicable technical/project questions and is included in context according to retention settings.
- Candidate clarifications, hints, help and silence rules vary by mode as specified.

### Recovery
- Completed turns survive refresh, network disconnect and reconnection.
- Mid-answer interruption requires repeat; the system does not invent a transcript.
- Voice failure offers retry or same-session text fallback; typed answers have no fabricated delivery score.
- Early finish generates a truthful partial debrief.

### Scoring/debrief
- All relevant 1–5 ratings link to evidence and include `insufficient_evidence` when appropriate.
- Valid alternative answers can be accepted.
- Technical and delivery scoring are separate; accents are never penalised.
- Assistance and retries are tracked independently from unassisted readiness.
- Disputed scores can be reassessed with original/revised results and a change explanation.
- Final results show coverage/confidence and never imply guaranteed hiring outcomes.

### Privacy/security
- Automated and manual checks verify that raw audio/video is never written to DB, object storage, local/session storage, IndexedDB, persistent temp folders, logs, analytics or crash reports.
- If a provider requires temporary file handling, cleanup occurs on all success/failure/cancel paths.
- First voice session requires clear informed consent with accurate provider disclosures.
- Recording status is obvious; Stop works immediately.
- Groq key is encrypted at rest, never returned to browser after submission, never included in logs, and never passed to Telegram.
- Authenticated user A cannot access user B's resumes, key references, interviews, transcripts or reports.
- History deletion also removes associated derived data from personalisation, indexes and caches.

### UI/design
- No interactive demo/guest access before required onboarding.
- High-quality responsive screens for desktop and mobile.
- Light workspace and dark orb-based interview studio are coherent and accessible.
- No generic repeated-card wall, fake metrics or non-functional controls.
- All meaningful controls work, with real loading/empty/error states.
- Respect reduced motion and keyboard navigation; labels and focus states are visible.

---

# Part II — Master Antigravity implementation prompt

> Copy everything in the prompt below into Antigravity. It is written to make Antigravity inspect the real codebase, preserve what's already working, and implement the product instead of merely returning recommendations.

## MASTER PROMPT START

You are the lead product engineer, staff full-stack architect, interaction designer, application security engineer, and test engineer for the existing **AI Interview Coach** repository. Your task is to evolve the current working Telegram AI Interview Coach into a premium, responsive, interview-first web application integrated with the existing backend.

### Highest-priority outcome
Deliver a genuinely usable first release centred on **turn-by-turn voice interviews**, text practice, adaptive follow-ups, trustworthy evaluations and an excellent debrief. Do not build a generic chatbot dashboard, do not rebuild working backend services blindly, and do not let secondary features displace the interview studio.

### Absolute non-negotiable constraints
1. **Never persist raw audio or video.** No database, object storage, browser storage, persistent file, log, crash report, analytics, or telemetry may retain raw audio/video. Audio can be captured and processed transiently only where needed. If temporary files are unavoidable, remove them in guaranteed cleanup/finally paths for success, error, cancellation, timeout, navigation and disconnect. Do not request camera permission for Release 1.
2. No claim that an external speech provider retains nothing unless its current, verified policy supports that claim. Explain application non-retention separately from third-party processing/retention and obtain clear consent before the first voice session.
3. No guest/demo access to app functionality. Clerk sign-in is followed by required Groq API key setup/validation, then required resume upload/review, then conversational placement setup, then dashboard. Enforce this in server/API guards, not just client-side navigation.
4. Groq API key is user-provided, encrypted at rest, never returned to the client in plaintext after initial submission, never stored in browser storage, logs, URLs, analytics, Clerk metadata or Telegram messages. Keep encryption material in server environment configuration and redact secrets from errors/logs.
5. Preserve working functionality, user data and the existing shared backend. Do not delete or rewrite the current Telegram bot, SQLite schema/data, Groq/Tavily integration, question bank, reminders, resume processing, mock interviews or progress features before auditing their actual state.
6. No fake UI data, fake success states, nonfunctional buttons, canned interview feedback or hard-coded metrics presented as real. Integrate actual APIs and handle empty/error states honestly.
7. Never invent resume details, achievements, project ownership, technical sources, candidate words, model outputs, or actual company interview questions. Scores cannot guarantee hiring.
8. Build the first release turn-by-turn. Future live streaming, voice-activity barge-in and coding execution must not be simulated as if complete.

## Phase 0 — Repository audit and baseline (mandatory before editing)

1. Inspect the complete repository tree and read the README, dependency files, environment examples, app entry points, database models/migrations, API routes, Telegram bot code, resume pipeline, existing Groq/STT/TTS, Tavily, tests, deployment scripts and frontend if present.
2. Run the existing tests/lint/type checks and start the current app where feasible. Record what works and the actual commands. Do not print secret values from `.env` or similar files.
3. Identify the current source of truth for users, sessions, answers, resume data and Telegram users. Find the existing user-key encryption implementation and verify that it is safe and not logging secrets. Do not assume the current implementation matches this prompt without inspecting it.
4. Produce a short implementation checklist in the repository (for example `IMPLEMENTATION_PLAN.md`) listing baseline findings, files likely to change, data migration needs, risks, and ordered milestones. Then continue with implementation; do not stop after planning or ask the user to approve normal engineering decisions.
5. Preserve a working baseline. Avoid broad refactors unrelated to the release. If the current project lacks a frontend, add a separate Next.js frontend without replacing FastAPI. If a frontend already exists, audit its patterns and evolve it consistently.

## Phase 1 — Shared architecture and safe authentication

### Frontend
Use Next.js App Router + TypeScript + Tailwind CSS; use shadcn/ui as the primary accessible component system and Motion for React for purposeful animation. Use Lucide icons. Integrate Clerk + Google sign-in using the current official supported integration for the installed framework version. Do not rely on a global CLI as the authentication integration.

### Backend
Keep the current Python 3.12 FastAPI backend and SQLite/aiosqlite as the initial source of truth where confirmed viable. Continue supporting the asynchronous Telegram bot. Avoid introducing unnecessary infrastructure, parallel databases, Redis, Kubernetes or extra services without evidence that they're needed.

Verify Clerk identity server-side on backend API requests. Never trust a client-provided user ID alone. Add consistent ownership checks to every profile, resume, key, interview, transcript, scratchpad, debrief, tracker and delete API. Use migrations that preserve existing records. Use UTC timestamps consistently.

### User key setup
- After successful Google sign-in, route a student without a valid Groq key into a dedicated setup screen before any other app feature.
- Explain that the student supplies their own key, why it is needed and what service it authorises.
- Validate using a minimal safe request and show actionable errors without leaking the secret.
- Encrypt at rest using maintained authenticated encryption and an environment-provided server-side encryption key. Never write plaintext key to database/logs/telemetry/client storage. Do not put secrets in URL query strings or responses.
- After submission, the UI may show `Groq key configured` and safe masked metadata, but must never fetch the plaintext key back. Support replacing/removing it. Block protected API calls when no usable key is configured.
- Do not expose the server-side Tavily key to students or browser JavaScript.

### Mandatory onboarding order
1. Clerk/Google sign-in.
2. Groq key entry, validation and safe storage (must come first after sign-in).
3. Required PDF/DOCX resume upload and parse.
4. Editable extracted profile confirmation.
5. Conversational preparation setup: infer company, role, seniority, target date and interview goals; ask only essential missing questions; show a confirmation/correction summary.
6. Generate initial personalised roadmap and open dashboard.

No direct URL, browser API call or Telegram command should bypass this sequence. Public landing content and any orb visual must be static/non-interactive; no guest interview demo.

## Phase 2 — Product visual system and component architecture

Create consistent design tokens and reusable components. Use the palette below as initial tokens, not scattered hard-coded colours:
- workspace ivory `#F4F1EA`;
- graphite `#20232C`;
- indigo `#5967F2`;
- studio midnight `#0B1020`;
- orb cyan `#65D9F2`;
- success teal `#168A72`.

Workspace pages use a warm, light, editorial productivity style. Interview studio uses a dark immersive layout. Avoid generic repeated-card grids, excessive gradients, game-like visuals and decorative animation without purpose.

Use shadcn/ui as the core; add selected components from other ecosystems only when there is a real design benefit. Define typography, spacing, border/radius, elevation, semantic colors, focus states and reduced-motion behavior. Support keyboard navigation and accessible contrast. Desktop uses a collapsible sidebar; mobile uses bottom navigation and responsive screen composition. Interviews get a distraction-free/fullscreen layout.

The interviewer is a glowing orb, not a person/character. Build a reusable orb component driven by the actual state machine: idle, preflight, listening/recording, transcribing, thinking, speaking, paused/error. Use subtle transitions and voice reactivity only when supported by a real signal. Respect `prefers-reduced-motion`.

## Phase 3 — Candidate profile, resume, dashboard and setup

Implement real resume upload/parsing for PDF and DOCX; handle invalid, empty, unreadable, oversized and unsupported files. Show an editable summary of skills, projects, tools, experience and achievements. Highlight uncertain extraction and important project-ownership claims. Candidate changes become canonical context for later questions. Do not assume every resume statement is independently verified.

Build the rich placement command-centre dashboard with interview practice as the most prominent action. Include recent sessions, next recommended action, skill/weak-topic map, recent debriefs, progress trend, upcoming prep actions and role-specific readiness only when the available evidence supports it. Clearly distinguish assisted from independent practice. Never invent progress numbers or employment probabilities.

Create a conversational preparation setup after resume confirmation. Infer known fields from natural language; ask only essential missing questions. Include target role, company (optional), seniority/level, target date, interview type, desired duration and focus areas. Summarise detected details for confirmation/correction before generating a plan. Roadmap should be structured and adaptive, but must not outgrow the interview priority.

## Phase 4 — Interview session engine (the core)

Implement an explicit session/turn state machine with validated transitions, idempotent submission, cancellation handling and persisted completed turns. Keep interview orchestration in reusable services/hooks rather than coupling it directly to visual components.

### Modes

**Realistic Simulation**
- role-play a professional interviewer;
- hide candidate transcript by default and allow reveal on request;
- hide answer scores until debrief; show neutral progress only;
- no teaching/model answer mid-interview;
- respond neutrally to procedural clarifications and rephrase ambiguous wording without revealing solutions;
- respectfully probe questionable claims and allow candidate to defend/revise;
- transition naturally after a brief pause to next question/follow-up;
- on early finish show a labelled partial debrief.

**Practice/Coaching**
- show editable recognised transcript after each answer;
- require confirmation/correction before evaluation;
- speak a concise coaching summary and show detailed visual feedback;
- show dimension scores, evidence, missing points, stronger answer and why it works;
- offer contextual hint/explanation and optional spoken retry or continue;
- score retry separately; preserve original result and record help used;
- wait for Retry/Continue after the spoken feedback is complete.

Offer Quick (5–10 min), Standard (15–20 min) and Full (30–45 min) modes. Allow early end at any time after confirmation.

### Interviewer style and blueprint
Let candidates select HR/behavioural, technical, hiring manager/project defence or mixed interview. Use the same orb/voice identity but adapt question style and rubric.

Before the session, generate/display a role-aware blueprint based on role, seniority, interview mode and difficulty. Include planned topic categories and allow the student to customise them. The interview must preserve essential coverage while using adaptive follow-ups.

### Question quality gate
Before a question is spoken, validate its clarity, role/seniority/difficulty fit, answerability, duplication, topic mapping, rubric existence, valid alternative answers and factual grounding where needed. Repair or replace a failing question. Every question must have a rubric and concept/category metadata. Keep the gate fast: reuse vetted questions/rubrics when that is safer/faster than generating from scratch.

### Adaptive probing, difficulty and context
- Usually ask one or two focused follow-ups when an answer exposes a gap, unsupported project claim or useful reasoning thread.
- Track questions, concepts and evidence already gathered. Avoid semantic duplication unless the new question intentionally tests a distinct skill or verifies progress.
- Calibrate difficulty from role/seniority baseline and early answers; adjust gradually and retain essential topic coverage. Offer fixed difficulty for exam-like practice.
- Keep a session-level memory of relevant technical claims, project details, assumptions and earlier explanations. Ask neutral clarification about material apparent inconsistencies. Never assume that inconsistency means dishonesty.
- Remember assistance used. It must not inflate independent-readiness scores.

### Voice implementation
Inspect the current working audio/STT/TTS flows before changing them. Preserve the existing functioning implementation. The repository reportedly uses Groq Whisper for STT; verify it and retain it if working. Make STT an adapter/interface so the provider can be changed later. Use browser-native speech synthesis first where supported for TTS, with selectable available English voices and speed setting, wrapped behind a TTS adapter for future provider upgrades. Do not assume browser speech APIs work identically on all platforms.

The interviewer voice should be professional/adaptive in Realistic Simulation and supportive in Practice mode. Keep a clear default voice and only offer choices available on the current device. Provide appropriate fallback if a voice is unavailable.

Required UX:
- Show the current spoken question as concise text while it is spoken; add Replay and collapse/expand controls.
- Show a visible capture indicator while recording and an immediate Stop control.
- Explicit `Stop Speaking` instantly stops the AI's audio; the student can respond, replay or continue.
- Do not implement unreliable auto-barge-in in Release 1; keep architecture ready for later streaming/VAD.
- Do not overlap interviewer playback and candidate recording unexpectedly.
- Use smart answer-duration guidance with an unobtrusive timer and gentle long-answer warning; hard stop only in a configured timed round.
- Handle silence patiently. Neutral prompt only after extended silence in Realistic mode; Practice can offer gentle prompt/hint. Silence alone is not an incorrect answer.
- Use truthful thinking/progress labels only while the respective work is actually occurring.
- On microphone/STT/TTS failures, explain the issue and offer retry or temporary typed input within the same session.
- On network disconnect, resume at the last confirmed turn. Ask the student to repeat a partial/interrupted answer; never guess its contents.

### Transcript accuracy
Preserve original ASR transcript and corrected transcript distinctly. Use the provider's actual confidence signal if available; don't invent a numerical confidence score if none exists. Use conservative uncertainty checks for important technical terms. In Realistic mode, prompt for correction/repeat only when uncertainty materially affects interpretation. Never finalise a score based on a known transcription error.

### Candidate controls
Keep primary record/submit/stop and end-session controls easy to reach. Show repeat/pause/skip when relevant and tuck secondary controls away. Realistic mode minimises assistance; Practice makes hints and transcript editing accessible. Confirm before ending. Completed turns must always remain available according to history settings.

### Scratchpad
Provide a compact optional text/code scratchpad for technical and project-defence questions supporting SQL, pseudocode and short notes. Keep it hidden for ordinary behavioural questions. Include scratchpad text in the answer context when the student intends it to be part of their response. Store it only according to the session's history controls. Defer diagrams and execution to later releases.

## Phase 5 — Audio/video privacy implementation (audit with tests)

Raw audio/video must never be retained. Implement privacy controls at each layer, not as a frontend promise only.

- Never insert audio/video bytes or file paths into a database record.
- Never upload to durable object storage.
- Never write audio/video to client storage, browser caches, analytics, request logs or crash dumps.
- Prefer transient memory/direct provider processing. If a temporary file is unavoidable, use a secure ephemeral location, strict permissions, unique names, and cleanup in a `finally` path covering success/failure/cancel/timeout/disconnect.
- Stop and release microphone tracks and clear audio buffers at the end of capture/when the session stops; revoke media object URLs when used.
- No camera feature in Release 1.
- Before first voice session, disclose what gets captured, how it is transcribed, what is stored, and the actual external provider(s) processing the data. Obtain clear consent; show recording status and immediate stop.
- Verify provider privacy terms before stating retention guarantees. Application-side deletion does not guarantee third-party deletion; describe this honestly.
- Save only text/derived data that the product needs and that the user-facing history policy explains.

Create automated privacy tests or deterministic instrumentation to verify prohibited persistence paths are absent. Test successful and failed transcription/cancellation; inspect logs and temporary directories as part of the test checklist. Do not store test recordings as fixtures in the product repository.

## Phase 6 — Evaluation, debrief and learning state

### Evidence-based scorecard
Use an adaptive role-aware rubric with anchored 1–5 scores for relevant dimensions: technical correctness, reasoning, structure, clarity, relevance, examples, depth, project ownership/trade-offs or behavioural evidence. Each score must link to evidence. Return `insufficient_evidence` rather than guessing when the record does not support a fair score.

Do not require exact phrase matching. Use question-specific marking rubrics/expected concepts, accept valid alternatives, and identify specific omissions/errors. Use trusted references or current research when the claim is uncertain, significant or time-sensitive—not on every answer. Distinguish verified facts from coaching judgments.

### Delivery vs content
Evaluate reliable pace, excessive filler words, long pauses, answer structure and intelligibility only when supported by the input signal. Keep delivery metrics separate from content correctness. Never penalise an accent or demand native-like pronunciation. Do not assess speaking delivery for typed fallback answers.

### Improved answer and retry
Show strengths, gaps, a stronger example grounded in the question/confirmed resume/project facts, and why it works. Use STAR for behavioural answers when appropriate. Never invent candidate experience or results. For meaningful gaps, offer Retry or Continue. Keep original and retry as separate attempts and track hints/assistance.

### Final and partial debrief
Build an interactive evidence-linked debrief with summary, role-weighted skill results, coverage, confidence, question timeline, expandable answer evidence, demonstrated/missing points, separate delivery/content findings, improved answers, targeted next practice, and contextual trustworthy references. Show unanswered items distinctly. If ended early, label the result as partial and don't imply unasked questions were wrong.

If feedback is disputed, let the student flag a point/explain the issue/correct transcript. Reassess using the same rubric, preserve original and revised scores and explain the change.

### Independent readiness vs assisted progress
Store original attempt, assistance, retries and later unassisted checks as distinct data. Unassisted answers are the strongest readiness evidence. Assisted attempts demonstrate learning but must not be treated as equivalent independent performance. Schedule varied, later unassisted checks for recurring misconceptions.

## Phase 7 — Resume, company preparation, coach, tracker and Telegram

### Project/resume integrity
Use confirmed resume data to generate project defence questions about actual claimed contributions, architecture, trade-offs, testing, limitations and security. Mark resume statements as candidate-provided unless independently verified. Ask neutrally about apparent inconsistencies; never infer dishonesty automatically.

### Company preparation and Tavily
Use a grounded hybrid of curated question bank, confirmed candidate profile, supplied job description and current Tavily research when relevant. Cite usable source links and retrieval date for current claims. Clearly label generated questions as practice questions, never as guaranteed actual questions from that company. Tavily key stays server-side; cache and cap usage responsibly.

### Coach/dashboard/roadmap/tracker
Implement the dashboard as a placement command centre with interview as the primary action. Add dedicated Coach workspace and a compact contextual coach outside active interviews; never overlay a coach on active interview controls. Keep roadmap structured/adaptive with transparent reasons for changes and student override. Implement a lightweight tracker with company, role, status, deadlines and interview dates; manual entry and job-link extraction should produce fields the student can review/confirm. Desktop uses Kanban; mobile uses a list and clear next actions.

### Telegram as companion
Keep the existing bot. The website is primary. Telegram gets daily question/reminder, quick text practice, short progress and next-action features. Optional account linking uses an expiring, one-time code, is rate-limited and reversible. Shared history flows through the same backend. The Groq key must never be sent through Telegram.

### Deferred coding
Do not build a full executable coding platform in this release. Keep a documented future interface for Java/C++ coding challenges and isolated hosted execution through a provider adapter (e.g., Judge0); never execute untrusted code directly on the FastAPI host.

## Phase 8 — Data model, deletion, security and performance

Audit and extend the schema via migrations; never drop existing data as a shortcut. Reuse current tables where viable. Models likely needed (adapt to the real project): user profile/role/preferences, encrypted credential metadata, resume and confirmed extracted profile, onboarding state, interview session, blueprint, question, turn/attempt, original/corrected transcript, scratchpad, assistance markers, rubric/evidence, score/evaluation version, debrief, topic mastery, spaced revision, company research cache/source metadata, placement tracker item, Telegram link, consent event and audit/event metadata without secret/media payloads.

Use explicit ownership/foreign key relationships and deletion cascades appropriate to policy. Individual session deletion and all-history deletion must remove associated transcripts, answers, score versions, scratchpad, feedback and derived personalisation/index/cache records so deleted material no longer influences future coaching. Retain only legitimate aggregate progress if the user-facing policy clearly allows it and the deletion action explains what remains; otherwise delete it too.

Use rate limits for key validation, linking, resume upload, question generation, Tavily and expensive LLM calls. Validate upload type/size/content. Prevent path traversal and unsafe filenames. Protect against XSS/HTML injection in parsed resume and model output. Keep external API calls time-bounded with retry/backoff only where safe. Use cancellation and request IDs for interview turn operations. Cache only non-sensitive content by default; don't use shared caches that can leak one user's context to another.

## Phase 9 — Test and delivery

Do not stop after creating attractive screens. Implement real end-to-end flows and verify them.

1. Keep/update/add unit tests for auth guards, key encryption/redaction, session-state transitions, question quality, rubric output validation, score versions, deletion, transcript corrections and media cleanup.
2. Add integration tests for onboarding order, interview turn processing, practice vs realistic behavior, text fallback, reconnect/recovery, early end, retry, disputed feedback and account-linking permissions.
3. Run formatting/lint/type checks, backend tests, frontend build and applicable E2E tests. Fix regressions you introduce.
4. Verify desktop, narrow mobile and keyboard/reduced-motion states. No horizontal overflow in interview studio on mobile.
5. Do not mark an action complete until its API response succeeds. Present errors in plain English and preserve the current session state on recoverable errors.
6. Document setup with safe placeholders only: `.env.example`, local development, migrations, tests, how to run Next.js + FastAPI + Telegram worker, and known provider limitations. Never overwrite `.env` or expose existing secrets. Include a production/deployment guide appropriate to the existing project and intended EC2 + Nginx + HTTPS setup, but do not deploy or change live infrastructure unless the user asks.
7. At the end, provide a concise changelog, actual files/features changed, exact commands run and their results, environment variables required (names only, never values), migrations, known limitations and next steps for deferred streaming/coding work. Clearly distinguish implemented/tested from planned/not tested.

### Definition of done
Release 1 is done only when a student can: sign in with Google; configure and validate their Groq key; upload/confirm a resume; complete setup; start a genuine turn-by-turn voice or text practice session; receive a clear question and speak/submit an answer; get a fair, evidence-backed evaluation with adaptive follow-ups; retry or continue; stop speaking; recover from a refresh or transient voice failure; finish early; review the debrief; inspect/correct transcript where applicable; dispute feedback; review/delete history; and use the website on mobile—without raw audio/video being retained and without breaking the existing Telegram bot/backend.

Now begin with Phase 0, then implement the phases in order. Make sensible, reversible decisions when details are missing, document any assumptions, and continue through coding and verification. Do not return only a plan or an explanation of what you would do.

## MASTER PROMPT END

---

# Part III — Quick implementation checklist

Use this checklist to judge whether Antigravity has produced the intended result:

- [ ] Repository audited and existing functionality baseline recorded.
- [ ] Clerk/Google auth integrated and enforced server-side.
- [ ] Groq key is mandatory, validated, encrypted at rest and redacted from logs.
- [ ] Resume is mandatory; parsing and candidate correction are working.
- [ ] No guest/demo route can enter AI functionality.
- [ ] Responsive workspace and immersive dark orb interview studio are implemented.
- [ ] Realistic Simulation and Practice modes behave differently as specified.
- [ ] Turn-by-turn voice and text fallback work through real backend integrations.
- [ ] Question gate, blueprint, adaptive difficulty/probing and deduplication work.
- [ ] Transcription correction, score evidence, retries and partial debriefs work.
- [ ] Cross-answer context and project-defence probing work without unfair accusations.
- [ ] Voice preflight, Stop Speaking, state-aware wait, recovery and session resumption work.
- [ ] Raw audio/video is not retained anywhere; cleanup and privacy tests exist.
- [ ] External provider disclosure and first-session consent are accurate.
- [ ] Debrief, user history deletion, disputed-feedback reassessment and readiness separation work.
- [ ] Company research links are grounded and generated questions are not misrepresented as guaranteed real questions.
- [ ] Telegram remains a lightweight optional companion and its current working behavior is preserved.
- [ ] Desktop/mobile/accessibility checks and project tests/build pass.
- [ ] Setup and deployment docs are updated without leaking secrets.
- [ ] Deferred real-time streaming, natural barge-in and coding execution are clearly marked as future work.
