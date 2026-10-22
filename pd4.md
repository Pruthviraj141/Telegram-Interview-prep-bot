# PHASE 4 OF 5 — VOICE ANSWERS, AI EVALUATION, MOCK INTERVIEWS AND PROGRESS TRACKING

## Project context

We are building an open-source Telegram AI Interview Coach for an initial audience of 1–20 users.

The application uses:
- Python 3.12
- python-telegram-bot with asynchronous polling
- FastAPI in the same application
- SQLite with aiosqlite
- Groq Python SDK
- Per-user Bring Your Own Key (BYOK)
- PyMuPDF and python-docx for resume extraction
- pytest and the existing test framework
- Docker and EC2 for deployment in Phase 5

Current model configuration:
- LLM: `openai/gpt-oss-20b`
- Speech-to-text: `whisper-large-v3-turbo`

Model IDs must remain configurable using environment variables or the project's existing settings system. Do not hardcode model names throughout handlers.

Implement Phase 4 only. Preserve existing working code and database data. Keep the backend simple and do not add unnecessary services.

---

## 1. Mandatory pre-flight checks

Before modifying any files:

1. Inspect the complete current implementation, database schema, configuration, README, existing tests and Git status.
2. Verify Phase 1 onboarding, resume handling and encrypted per-user Groq key storage.
3. Verify Phase 2 question bank, topic preferences, random practice and topic teaching.
4. Verify Phase 3 scheduling, daily-question delivery, reminders and persistent delivery state.
5. Run the existing regression tests.
6. If a previous phase is incomplete or a critical regression test fails, do not implement Phase 4. Report the exact failures and stop.
7. Preserve uncommitted changes and existing data. Never reset Git, overwrite `.env`, delete files blindly, or expose actual credentials.

Never request, print or hardcode the Telegram token, Groq keys or encryption keys. Use mock credentials in automated tests.

## 2. Architecture and design constraints

Use the existing application and service patterns.

Keep the implementation to a few clear responsibilities:

- Telegram answer and interview handlers.
- Voice download and transcription service.
- Answer evaluation service.
- Mock-interview session service.
- Progress retrieval and formatting.
- Small validated data schemas for evaluation output.

Reuse the existing question bank, user profile, resume analysis, per-user key retrieval, SQLite database and Telegram menus.

Do not introduce Redis, PostgreSQL, Celery, LangChain, a vector database, microservices or another backend.

Use asynchronous I/O wherever the existing stack supports it. Apply bounded timeouts, safe error handling and limited retries. Do not hold database write transactions open while waiting for Groq or Telegram network operations.

## 3. Text answers for all question modes

Implement text-based answers for:

- Daily Question.
- Random Topic Practice.
- Questions raised during Teach Me a Topic.
- Individual questions within Mock Interview.

The bot must identify the active question or interview session for the correct Telegram user before evaluating an answer.

If there is no active question or the context is ambiguous, respond with clear navigation options rather than evaluating an unrelated message.

When a user answers:

1. Persist the answer and associate it with the correct user, question and session.
2. Prevent duplicate processing when the user presses a button repeatedly or resubmits the same update.
3. Evaluate the answer using the user's own Groq API key.
4. Validate the result against the evaluation schema.
5. Save the result and update the user's progress.
6. Return the feedback through Telegram.
7. Provide a safe retry option when evaluation fails.

Persist submitted answers before calling Groq. If Groq is temporarily unavailable, retain the answer and permit evaluation to be retried without requiring the user to type or record it again.

Support reasonable text-length limits and split long responses into Telegram-safe messages.

Never silently substitute another user's key or an administrator's API key.

## 4. Telegram voice-message processing

Implement voice answers using native Telegram voice messages.

### Required flow

Telegram voice message
→ validate incoming media
→ download audio temporarily
→ transcribe with Groq Whisper
→ validate transcript
→ associate transcript with the active question
→ evaluate using Groq LLM
→ save transcript and evaluation
→ return feedback to Telegram.

### Audio requirements

1. Reuse the user's existing decrypted Groq API key through the established credential service.
2. Use the configurable speech-to-text model, initially `whisper-large-v3-turbo`.
3. Telegram voice notes are commonly OGG/Opus. Use the supported upload format when possible; do not introduce FFmpeg unless testing proves conversion is required.
4. Validate file size, duration, content and supported format before processing.
5. Use a configurable maximum audio size. Default to no more than 25 MB for the initial free-tier-oriented configuration, subject to the provider's current limits and Telegram's download constraints.
6. Apply a configurable maximum voice-message duration appropriate for interview answers.
7. Enforce a reasonable minimum duration and detect silent, empty or unusable transcriptions.
8. Request English transcription because English is the initial supported learning language.
9. Use timeouts and distinguish invalid keys, quota exhaustion, unsupported media, temporary provider failures and network failures.
10. Respect provider rate-limit information such as `Retry-After`. Do not loop indefinitely.
11. Avoid logging audio, transcripts, credentials or private resume contents.
12. Delete temporary audio files in a guaranteed cleanup operation, including after exceptions.
13. Do not retain the original recording after transcription. Persist the transcript and answer evaluation, not raw audio.
14. If transcription fails, keep the user informed and offer to retry or submit a text answer.
15. If a transcript is empty or obviously unusable, do not score the user as though the answer were incorrect.
16. Save a transcription status so a failed evaluation or API request can be retried without unnecessary repeated transcription when the transcript is already available.

Use safe file handling and unique temporary filenames. Never construct paths from user-controlled filenames. Make sure simultaneous users cannot access one another's temporary audio files.

## 5. AI answer-evaluation rubric

Implement one shared evaluation service for text and voice answers.

Use the existing question-bank entry as the primary source of truth. Supply the question text, topic, difficulty, expected key concepts, model answer and the user's response to the model.

Where useful, include only relevant resume-derived context. Do not send the entire resume when it is unnecessary.

The model must evaluate the actual content of the response rather than simply matching keywords.

### Required evaluation output

Return a structured result containing:

- Question ID and topic.
- Technical correctness score from 0–10.
- Concept completeness score from 0–10.
- Communication and clarity score from 0–10.
- Overall score from 0–10.
- Short assessment summary.
- What the user did well.
- Important concepts missed.
- Incorrect or misleading claims, where present.
- Grammar or sentence-structure corrections.
- Unnecessary repetition or filler-word observations supported by the response.
- A corrected, interview-ready answer.
- One or two suitable follow-up questions.
- A concise improvement suggestion.

Use Pydantic or the project's existing validation approach to validate every response before saving or displaying it.

Prefer the existing Groq client's structured JSON/JSON-schema response support where compatible with the configured model. Validate the output locally even when the model returns schema-conforming JSON.

Do not trust unvalidated model output, arbitrary extra fields, malformed numeric scores or an invented question ID.

### Scoring policy

Define and document the scoring method. For technical questions, prioritise technical accuracy and concept completeness. For HR questions, prioritise relevance, clarity, examples and structure.

Do not use one inappropriate scoring formula for every question category. Use the question category and expected answer concepts to inform evaluation.

Scores are coaching estimates, not objective guarantees of interview success. Do not artificially inflate scores or penalise a correct answer just because it uses different wording from the model answer.

An answer that is partially correct should receive proportionate credit, with specific explanation of what is missing.

### English and spoken-communication feedback

For voice answers, distinguish transcription uncertainty from the user's actual answer quality.

Provide grammar and clarity suggestions based on the available transcript. Mention filler words and unnecessary repetition only when supported by the transcribed content.

A transcript cannot reliably establish vocal confidence, tone, pronunciation accuracy or emotional state. Do not claim to measure these attributes from text alone. In Phase 4, give useful communication coaching without pretending unsupported acoustic analysis exists.

Do not rewrite the user's answer so aggressively that its original meaning changes.

## 6. Daily Question integration

Integrate answer submission with the existing Phase 3 daily-question records.

When a user submits a valid answer:

1. Associate the answer with that day's persisted question ID.
2. Save an answer-attempt record before external evaluation.
3. Mark the daily challenge as answered/completed using the existing Phase 3 state model so its reminder is suppressed.
4. Run the evaluation and persist the feedback.
5. If evaluation fails, retain the answer and expose a retry action without sending the daily question or reminder again.

Make the operation safe against repeated Telegram updates and double taps.

Do not create a second daily-question record, change the selected question or reset the existing schedule.

Users who simply mark a question complete without answering must remain distinguishable from users who actually answered it.

For random practice, save the answer against the actual displayed question. Do not resolve the question by picking a new random question during answer processing.

Keep hint and model-answer disclosure behaviour from Phase 2 intact.

## 7. Mock Interview

Implement the multi-question interview mode specified in the product requirements.

### Start flow

1. User selects Mock Interview.
2. Ask whether the interview should focus on selected topics, resume/projects, or a mixed interview.
3. Let the user select a sensible question count, with five questions as the default.
4. Explain that answers may be submitted by text or voice.
5. Start and persist the session in SQLite.

### Interview execution

- Ask one question at a time.
- Select appropriate questions from the existing validated question bank.
- Use topic preferences and relevant resume-derived skills.
- Avoid repeating a question within the same session.
- Store the selected question ID before showing each question.
- Accept either text or voice for the current question.
- Save each answer and its evaluation.
- Advance only after the answer has been successfully saved and evaluated, or provide a recovery path for failed evaluations.
- Keep per-answer scores and feedback hidden during the interview, except for necessary operational error messages. The chosen interview mode should provide the overall report at the end.
- Include an explicit End Interview action.
- Handle cancellation, duplicate callbacks, bot restart and expired sessions.
- Use a persistent session status so the user can resume a valid unfinished interview after a restart.
- Verify that every callback and session operation belongs to the correct Telegram user.

Do not implement a real-time voice call or continuous streaming conversation. Voice responses remain ordinary Telegram voice messages.

### Final report

After the last answer, produce an overall report containing:

- Number of questions answered.
- Overall coaching score.
- Per-question scores and key feedback.
- Strongest topics or concepts demonstrated.
- Most important knowledge gaps.
- Communication and grammar improvement areas.
- A small recommended revision plan based on actual scores.
- Suggested next practice topics.

Calculate the session summary from persisted evaluations. Do not invent averages, performance history or evaluations that were never saved.

Allow the user to view the completed report again without rerunning the interview or charging the user's API quota again.

## 8. Persisted progress tracking

Add a My Progress menu option if it is not already implemented.

Show useful, concise statistics derived from actual stored data:

- Questions answered.
- Daily challenges completed through answers.
- Mock interviews completed.
- Recent overall scores.
- Average score over a clearly defined recent set of evaluated answers.
- Topic-level strengths and weaknesses when enough evaluated answers exist.
- Recommended practice based on actual weak areas.

Exclude unanswered questions and failed evaluations from score averages. Clearly state the sample count so users do not mistake one score for a reliable trend.

Avoid declaring a topic weak after one insufficient or failed evaluation. Use a reasonable minimum evidence threshold and explain when there is not enough history.

Reuse existing question, answer, evaluation and interview records. Do not duplicate all historical data into a second progress table unless an established design genuinely requires it.

Allow users to review recent answer feedback. Respect the existing privacy and account-deletion design.

Persist everything needed to rebuild progress after an application restart.

## 9. Database changes and state integrity

Inspect the current database schema before modifying it.

Add only the required tables or columns, using idempotent changes that preserve existing data.

The implementation should persist the necessary information for:

- Answer attempts.
- Text or voice input type.
- Transcription status and transcript where relevant.
- Evaluation status, validated scores and structured feedback.
- Associated question IDs and daily-delivery references.
- Mock-interview sessions and question order.
- Session status, per-question answers and evaluation results.
- Completion timestamps and safely retriable operations.

Reuse existing user IDs, question IDs and daily-question IDs.

Use transactions, parameterised queries and explicit user ownership checks. Add appropriate uniqueness constraints for idempotency.

Do not hold write locks while making external API calls. Avoid concurrent requests overwriting evaluation results or advancing a mock interview twice.

Ensure database updates are compatible with Phase 3 reminders and delivery records.

## 10. Quota, errors and performance

Each user's API key has its own limits, account status and provider quota.

Handle:

- Invalid or revoked keys.
- Rate-limit responses and quota exhaustion.
- Transcription failures.
- LLM failures.
- Network timeouts.
- Unsupported audio.
- Empty or unclear answers.
- Malformed model responses.
- Telegram API errors.
- Duplicate update delivery.
- User cancellation during processing.
- Application restarts while work is pending.

Use bounded retries and sensible timeouts. Do not retry a permanent authentication failure indefinitely.

Do not silently switch to the application's own Groq key or use another user's key.

Do not automatically call several different LLMs for the same answer. Keep the configured model as the default.

Avoid repeating successful STT or evaluation calls unnecessarily. Persist completed results and return them again when a user revisits an answer.

Provide clear Telegram messages explaining whether the user can retry, submit text instead, or wait for their quota to reset.

## 11. Security and privacy

- Never log API keys, bot tokens, decrypted credentials or encryption keys.
- Reuse Phase 1 encryption and key-retrieval logic.
- Keep credentials isolated per user and construct the request client using the correct user's key.
- Never save raw voice recordings.
- Never expose another user's answers, transcripts, interview sessions or progress.
- Treat resume content, answers and any LLM-provided content as untrusted data.
- Do not let instructions in user answers alter application permissions or execute arbitrary tools.
- Validate Telegram callback ownership and all persisted session IDs.
- Use bounded input sizes and safe temporary-file handling.
- Preserve the existing `.env` and `.gitignore`; do not add real secrets to source files.
- Do not log full private answer or resume content merely to aid debugging.

## 12. Automated testing requirements

Add unit, integration and regression tests using temporary SQLite databases and mocked Telegram/Groq responses.

No automated test should require a real API key, live Telegram account, live Groq API, internet access or actual paid usage.

Test at least:

1. All Phase 1–3 regression tests.
2. Text answers attached to the correct active question.
3. Voice-message file validation and size/duration rejection.
4. Mock Telegram audio download without storing permanent recordings.
5. Correct handling of supported OGG voice messages.
6. Temporary-file cleanup on both success and every failure path.
7. Speech-to-text success, empty transcription, timeout, invalid key and rate-limit responses.
8. Correct selection of the current user's Groq credentials.
9. Prevention of cross-user access to questions, answers and sessions.
10. Structured evaluation validation, malformed output and out-of-range scores.
11. Technical completeness and score calculation with known mocked cases.
12. Correct feedback for partially correct answers.
13. Retry after failed evaluation without losing or duplicating the stored answer.
14. Daily challenge completion and reminder suppression following answer submission.
15. Repeated Telegram updates do not create duplicate answer attempts or evaluations.
16. Mock interviews ask one question at a time and preserve the intended question order.
17. Session cancellation, restart recovery and callback replay protection.
18. Final mock-interview report is calculated from saved evaluation results.
19. Progress averages exclude failed and unevaluated answers.
20. No raw audio, API key, bot token or unnecessary private content appears in logs.
21. Groq quota errors and Telegram errors are handled without retry loops.
22. The main application starts and shuts down correctly after the new integration.

## 13. Definition of done

Before completing Phase 4:

1. Run the complete existing and new test suites.
2. Fix failures attributable to Phase 4.
3. Report the actual test commands, results, counts, failures and skipped tests.
4. Inspect the Git diff for unrelated changes, secrets, duplicated services and unnecessary dependencies.
5. Verify that all database changes preserve existing users, question history, delivery records and settings.
6. Provide manual Telegram testing instructions covering a daily text answer, daily voice answer, random practice, evaluation retry, a complete mock interview and progress review.
7. Distinguish mocked tests from any real provider or live Telegram tests.
8. Document known limitations honestly.
9. Stop after Phase 4 and wait for review.

Do not begin Phase 5 or deploy to EC2 in this phase. Do not claim the application is completely error-free or production-ready merely because automated tests pass.