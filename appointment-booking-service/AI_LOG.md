# AI Prompt and Use Record

## 1. Workflow & Data Hygiene
No credentials, proprietary code, or sensitive personal data were included in any prompts. All AI-generated code and test cases were reviewed line-by-line, edited for edge-case correctness, and verified via automated Jest tests.

## 2. Prompt & Decision Log

### Activity 1: Initial Service Architecture & Overlap Logic
* **Prompt Summary:** *"Design a minimal in-memory Node.js service module for conflict-safe appointment booking and cancellation using UTC timestamps, ensuring adjacent slots are allowed and concurrent requests for the same provider cannot double-book."*
* **AI Response Summary:** Suggested an `AppointmentService` class using a `Map` for storage, `Date.parse()` for timestamp conversion, `startA < endB && startB < endA` for overlap detection, and a global mutex lock for concurrency.
* **Disposition (Accepted / Edited / Rejected):**
  * **Accepted:** Half-open interval overlap formula (`startMs < existing.endMs && existing.startMs < endMs`) and typed domain errors (`ValidationError`, `ConflictError`, `NotFoundError`).
  * **Edited:** Replaced the AI's suggested **global lock** with a **per-provider lock map** (`providerLocks`) so concurrent bookings for *different* providers do not unnecessarily contend on the same lock.
  * **Rejected & Replaced:** Rejected relying solely on `Date.parse()` for timestamp validation because JavaScript's `Date.parse()` silently accepts non-UTC offsets (`+05:30`), missing timezone offsets (interpreting them inconsistently), and invalid calendar dates like `2026-02-30` (rolling over to March 2). Added `parseStrictUtcTimestamp()` with regex enforcement (`Z` / `±00:00`) and ISO date prefix verification.
* **Files Informed:** `src/appointmentService.js`, `DESIGN.md`

### Activity 2: Edge-Case & Concurrency Test Generation
* **Prompt Summary:** *"Generate Jest unit tests covering valid booking, partial/full/enclosing overlaps, adjacent boundaries, cancellation rebooking, invalid inputs without state mutation, and concurrent booking race conditions."*
* **AI Response Summary:** Generated standard `describe`/`test` blocks covering happy path, overlap cases, and `Promise.allSettled` concurrency checks.
* **Disposition (Accepted / Edited / Rejected):**
  * **Accepted:** Parameterized `test.each` structure for overlap permutations and `Promise.allSettled` pattern for verifying 1 success + 9 `ConflictError` rejections under concurrency.
  * **Edited:** Added explicit assertions verifying `service.appointments.size === 0` after every invalid input test to guarantee failed validations never mutate internal state, and added a calendar-rollover test case (`2026-02-30T10:00:00Z`).
* **Files Informed:** `tests/appointmentService.test.js`

## 3. Verification Evidence
Executed `npm test` on Node.js with Jest:
```text
PASS  tests/appointmentService.test.js
  AppointmentService
    1. Valid booking
      ✓ books a valid appointment with positive duration in UTC
    2. Same-provider overlap vs. different providers
      ✓ rejects overlapping booking (exact match) for the same provider
      ✓ rejects overlapping booking (partial overlap at start) for the same provider
      ✓ rejects overlapping booking (partial overlap at end) for the same provider
      ✓ rejects overlapping booking (contained inside existing) for the same provider
      ✓ rejects overlapping booking (enclosing existing) for the same provider
      ✓ allows overlapping time slot for a different provider
    3. Adjacent appointments
      ✓ allows booking immediately before and immediately after an existing appointment
    4. Cancellation behavior
      ✓ cancelling an active appointment frees the slot for a new booking
      ✓ rejects cancelling a non-existent appointment ID
      ✓ rejects cancelling an already-cancelled appointment
    5. Input validation without state mutation
      ✓ rejects missing providerId and leaves store unchanged
      ✓ rejects empty clientId and leaves store unchanged
      ✓ rejects non-UTC offset timestamp and leaves store unchanged
      ✓ rejects missing timezone designator and leaves store unchanged
      ✓ rejects invalid calendar date (Feb 30) and leaves store unchanged
      ✓ rejects zero duration (start === end) and leaves store unchanged
      ✓ rejects negative duration (end < start) and leaves store unchanged
    6. Concurrency safety
      ✓ allows only one booking when multiple concurrent overlapping requests arrive for the same provider

Test Suites: 1 passed, 1 total
Tests:       19 passed, 19 total
```
