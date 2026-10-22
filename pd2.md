# PHASE 3 OF 5 — DAILY QUESTION ENGINE

## Project

Telegram AI Interview Coach: an open-source, BYOK-first interview preparation bot for an initial audience of approximately 1–20 users.

Implement **Phase 3 only**. Extend the existing Phase 1 and Phase 2 implementation. Do not rebuild working features or introduce unnecessary infrastructure.

## 1. Mandatory pre-flight checks

Before modifying files:

1. Inspect the current source code, README, configuration, database schema, Git status and test suite.
2. Verify that Phase 1 onboarding, resume handling, secure Groq-key storage and profile persistence are working.
3. Verify Phase 2 question-bank validation, topic selection, random practice, resume analysis and teach-a-topic functionality.
4. Run the relevant existing regression tests.
5. If either previous phase is missing or its required tests fail, do not implement Phase 3. Report the exact failures and stop for review.
6. Preserve user changes and existing data. Never reset Git, delete files blindly, overwrite the real `.env`, expose secrets or print API keys.
7. Do not request credentials in chat, put real credentials into source code or claim tests passed without actually running them.

## 2. Fixed technology stack

Continue using:

- Python 3.12.
- The existing asynchronous `python-telegram-bot` application.
- The existing FastAPI application.
- SQLite with `aiosqlite`.
- The current validated question bank and topic-selection implementation.
- Python's standard `asyncio`, `datetime` and `zoneinfo` facilities.
- `pytest` and the existing test tooling.

Do not add Redis, PostgreSQL, Celery, APScheduler, a vector database, LangChain, microservices or another scheduler service.

**Scheduling design:** use one supervised asynchronous background task within the existing application. It periodically checks SQLite for due deliveries and reminders. Ensure only one scheduler loop is started per application instance and that it shuts down gracefully.

The initial deployment will run a single application instance. Use database constraints and transactions to prevent duplicate work within this design. Do not claim the system provides mathematically guaranteed exactly-once Telegram delivery.

## 3. User schedule settings

Implement daily-question scheduling through the existing Settings/Notifications menu.

Users must be able to:

- Enable daily questions.
- Choose a local delivery time in `HH:MM` 24-hour format.
- Choose their timezone.
- Change their delivery time or timezone later.
- Pause and resume daily delivery.
- Enable or disable one daily reminder.
- View their current settings.

Timezone requirements:

- Store an IANA timezone name, such as `Asia/Kolkata` or `Europe/London`.
- Use Python `zoneinfo` for timezone calculations.
- Store timestamps in UTC and preserve the timezone used for each scheduled delivery.
- Validate timezone names; never trust arbitrary timezone input.
- Provide convenient timezone choices and an option to enter another valid IANA timezone.
- You may prefill `09:00` and `Asia/Kolkata`, but explicitly ask the user to confirm before enabling scheduling. Never silently assume a user's timezone.
- Handle daylight-saving changes safely. Do not deliver twice when a local clock time occurs twice.
- Explain or safely handle a requested time that falls inside a daylight-saving gap.

If the schedule is incomplete or invalid, daily delivery must remain disabled and the bot must explain what needs correction.

After onboarding, offer users the option to configure their daily question schedule. They may configure it immediately or return to Settings later.

## 4. Daily question selection

Every enabled, onboarded user receives one daily question selected from the existing validated question bank.

Use the user's existing information:

1. Questions from the topics they selected.
2. Questions relevant to skills or technologies extracted from their resume, where those skills map to the existing question-bank topics or tags.
3. Occasional discovery questions from other categories.

Use a simple configurable selection strategy, initially approximately:

- 70% selected-topic relevance.
- 20% resume-derived relevance.
- 10% topic discovery.

These are selection preferences, not strict guarantees. Handle overlapping topic groups sensibly, avoid repeatedly selecting a topic that has no available questions, and fall back to other eligible questions if necessary.

Do not call Groq merely to select or send a question. The curated question bank must remain usable without an AI request.

Selection requirements:

- Reuse existing question IDs and topic slugs.
- Prefer questions not delivered recently, using persistent delivery history.
- Avoid consecutive or unnecessary repeats.
- If all eligible questions have been used, choose a least-recently-delivered eligible question and cycle fairly.
- Handle empty or invalid question banks safely.
- Never create a second question for the same user's daily delivery when the existing record already determines the question.
- Make question selection a testable service independent of Telegram sending code.
- Do not modify or overwrite the original question-bank content merely to implement scheduling.

Future performance-based weak-area weighting will be introduced when answer evaluation and scoring exist in Phase 4. Do not fabricate performance information in Phase 3.

## 5. Durable database records

Inspect the existing schema before adding anything. Extend it using safe, idempotent database changes that preserve all existing users and data.

Create only the necessary tables or columns.

The implementation must persist:

### Schedule settings

- Telegram user ID.
- Whether daily questions are enabled.
- Local delivery time.
- IANA timezone.
- Whether reminders are enabled.
- Relevant creation/update timestamps.

### Daily delivery records

At minimum, persist:

- Telegram user ID.
- Scheduled local date.
- Timezone snapshot.
- Intended scheduled UTC timestamp.
- Selected question ID.
- Delivery status.
- Attempt count.
- Last attempt time.
- Successful Telegram send time.
- Next retry time, when applicable.
- A safe error category, without secrets or unnecessary user content.
- Reminder due time and reminder delivery status.
- Reminder attempt count and successful delivery time.
- Completion status and completion timestamp, where applicable.

Use a database uniqueness constraint or equivalent transaction-safe protection to prevent multiple daily-question records for the same user and scheduled local date.

Handle timezone changes explicitly. Changing a timezone during the day must not accidentally produce two daily questions simply because the local calendar date changed. Check recent delivery history and define an appropriate safe policy.

Do not hold a write transaction open during Telegram network requests.

## 6. Delivery engine

Implement the scheduler as one asynchronous task that checks due work at a reasonable interval, initially approximately every 30–60 seconds.

The task must:

1. Find enabled users whose daily delivery is due.
2. Determine the applicable local date and timezone.
3. Create or recover the day's delivery record without duplication.
4. Select and persist the question before attempting delivery.
5. Send the question through Telegram.
6. Mark successful deliveries with their Telegram message ID and send time.
7. Record failures without discarding the selected question.
8. Schedule a bounded retry for temporary errors.
9. Avoid repeatedly retrying permanent errors.
10. Resume eligible pending deliveries after an application restart.
11. Respect Telegram rate limits and `RetryAfter` instructions.
12. Stop safely for users who blocked the bot or whose chat is no longer accessible.
13. Never send messages to users who have not initiated the bot or completed required onboarding.

Keep the code simple. Do not add a distributed lock service or separate worker.

Be honest about the delivery guarantee: if Telegram accepts a message but the network response is lost before the application records success, a rare duplicate can remain possible. Design the status tracking and retry policy to minimise this risk rather than claiming impossible exactly-once delivery.

## 7. Daily question message and buttons

The daily message should be concise and mobile-friendly.

Include:

- A clear heading such as “Your Daily Interview Challenge”.
- The question text.
- Topic and difficulty.
- The date of the challenge in the user's local timezone.
- A `Show Hint` button.
- A `Reveal Model Answer` button.
- A `Mark as Completed` button.
- A safe navigation action back to the main menu.

Use the existing question-bank data for hints and model answers. Do not show the model answer automatically.

Validate callback ownership: a user must not be able to change another user's completion status by replaying callback data.

Handle repeated button presses, stale callbacks and bot restarts gracefully. Ensure hints and answer reveals refer to the correct stored daily question, not an arbitrary newly selected question.

When a question is marked complete, persist completion and suppress its pending reminder.

Phase 4 will connect text and voice answers to evaluation and automatically update completion state. Do not implement answer scoring or pretend that daily responses have already been evaluated in this phase.

## 8. Reminder policy

The product requires one reminder later on the same day when the user has not completed their daily question.

Initial behaviour:

- Reminders are enabled by default when the user opts into daily scheduling.
- Set the default reminder delay to three hours after successful delivery.
- Keep this delay in configuration or a clearly named constant, not scattered through handler code.
- Deliver at most one successful reminder per daily question.
- Skip the reminder if the user has completed the question, disabled reminders, paused scheduling, or no longer has an accessible chat.
- Do not send the reminder on the next calendar day if the configured delivery time would push it past the user's local day.
- Persist reminder status and retry information, so restarts do not blindly resend reminders.
- Handle a user completing the challenge while a reminder is becoming due.
- Offer the option to disable reminders in Settings/Notifications.

The reminder should refer to the already delivered daily question. It must not silently generate or send a second daily question.

## 9. Completion and recovery

Implement a persistent daily-question state machine with clear transitions, such as:

`pending -> sending -> sent -> completed`

For reminders, maintain their own status rather than reusing daily-question delivery status.

Use bounded retry delays for temporary failures and persist retry scheduling. On startup, safely recover eligible stale `sending` records and due pending jobs without creating duplicate daily-question records.

Avoid treating every exception as retryable. Respect Telegram's explicit rate-limit information and distinguish permanent chat errors from temporary network failures.

If delivery repeatedly fails, record a terminal failure or defer it according to a bounded policy. Never enter an unlimited rapid retry loop.

The scheduler must not block Telegram command handling. Keep network operations asynchronous where supported, make the polling interval configurable, and implement clean cancellation during application shutdown.

## 10. Commands and navigation

Integrate with the current application rather than duplicating menus or registering conflicting handlers.

Add only necessary commands or menu actions, for example:

- `/daily` — view or retrieve the current daily challenge, without causing duplicate new deliveries.
- `/schedule` — configure or inspect the user's delivery settings.
- Existing `Settings / Notifications` buttons — configure time, timezone, enable/disable delivery, and toggle reminders.

Use existing navigation conventions. Users must always be able to return to the main menu.

Do not implement daily-answer evaluation, audio transcription, mock interviews or AI-generated scoring. These belong to Phase 4.

## 11. Logging and privacy

- Never log API keys, decrypted credentials, encryption keys, bot tokens or setup tokens.
- Do not log complete resume contents or unnecessary answer text.
- Log scheduler events with safe identifiers and structured status information.
- Avoid returning stack traces or internal database errors to Telegram users.
- Make error messages actionable without exposing internal implementation details.
- Do not introduce new secrets or hardcode the Telegram bot token.
- Use the existing environment configuration and `.gitignore`.

## 12. Automated tests

Use temporary SQLite databases, mocked Telegram calls, fake clocks or deterministic time injection, and the existing question bank. The automated test suite must not require real credentials, internet access or a live bot.

Add tests covering at least:

1. Existing Phase 1 and Phase 2 regression tests.
2. Valid and invalid delivery-time settings.
3. Valid, invalid and changed timezone settings.
4. Confirmation required before enabling an incomplete schedule.
5. Local-time scheduling in different timezones.
6. Daylight-saving transitions and duplicate suppression.
7. Exactly one daily record for a user and scheduled local date under repeated scheduler checks.
8. Prevention of immediate question repeats where alternatives exist.
9. Resume-aware and selected-topic selection with a deterministic fallback.
10. Empty topic selections and empty question categories.
11. Persistence across SQLite connections and application restart.
12. Successful Telegram delivery and delivery-status updates.
13. Temporary network errors, retry limits, flood control and permanent chat failures.
14. Recovery of stale pending/sending work without creating duplicate database records.
15. Reminder timing, reminder suppression after completion, disabled reminders and same-day boundaries.
16. Repeated and stale callbacks, including cross-user callback ownership.
17. Pause/resume, timezone changes and delivery-history consistency.
18. Concurrent scheduler ticks not creating duplicate daily records.
19. Single scheduler lifecycle, graceful shutdown and no duplicate background loops.
20. Logs contain no API keys, bot tokens or unnecessary private content.

Test observable behaviour, not merely that functions return without exceptions.

## 13. Definition of done

Before finishing:

- Run the complete existing and new automated test suites.
- Fix failures attributable to Phase 3.
- Report the actual commands, test counts, failures and skipped tests.
- Inspect the final Git diff for unrelated edits, exposed secrets and unnecessary dependencies.
- Verify database changes preserve existing Phase 1 and Phase 2 records.
- Provide manual Telegram test steps for daily scheduling, scheduled delivery, hints, model answers, completion, reminders, pause/resume and timezone changes.
- Document the delivery guarantee and any known limitations honestly.
- Do not claim a scheduled message was tested in a live Telegram chat unless it was actually tested.
- Stop after Phase 3 and wait for review. Do not begin Phase 4 and do not deploy to EC2 in this phase.