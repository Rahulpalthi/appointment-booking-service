# Design Specification: Conflict-Safe Appointment Booking Service

## 1. Service Boundary & Scope
This module implements an in-memory scheduling domain service (`AppointmentService`) scoped strictly to two core mutations:
1. `bookAppointment({ providerId, clientId, startTime, endTime })`
2. `cancelAppointment(appointmentId)`

Out-of-scope concerns (HTTP transport, authentication, notifications, recurring rules, and external databases) are intentionally excluded per the assessment boundaries.

## 2. Data Model & API Design

### Appointment Record
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` (UUID v4) | Unique appointment identifier |
| `providerId` | `string` | Provider identifier |
| `clientId` | `string` | Client identifier |
| `startTime` | `string` (ISO-8601 UTC) | Inclusive start timestamp |
| `endTime` | `string` (ISO-8601 UTC) | Exclusive end timestamp |
| `status` | `'ACTIVE' \| 'CANCELLED'` | Lifecycle state |
| `createdAt` | `string` (ISO-8601 UTC) | Creation timestamp |
| `cancelledAt` | `string \| null` | Cancellation timestamp if cancelled |

### Error Contracts
* **`ValidationError`**: Missing identifiers, non-UTC or malformed ISO-8601 strings, calendar date rollovers (e.g., Feb 30), or non-positive durations (`endTime <= startTime`).
* **`ConflictError`**: Time interval overlaps an existing `ACTIVE` appointment for the same `providerId`, or attempting to cancel an already `CANCELLED` appointment.
* **`NotFoundError`**: Attempting to cancel an unknown `appointmentId`.

## 3. Booking Invariant & Overlap Math
Each active appointment represents a half-open interval $[start, end)$ in UTC epoch milliseconds.
* **Invariant:** For any provider $P$, no two `ACTIVE` appointments $A$ and $B$ may satisfy:
  $$A.\text{startMs} < B.\text{endMs} \;\land\; B.\text{startMs} < A.\text{endMs}$$
* **Adjacency:** Because inequalities are strict (`<`), back-to-back appointments where $A.\text{endMs} = B.\text{startMs}$ evaluate to `false` for overlap and are permitted.
* **Cancellation:** Setting `status = 'CANCELLED'` excludes the record from conflict checks while preserving an immutable audit trail.

## 4. Concurrency & Persistence Approach
* **Persistence:** Two in-memory `Map` structures—`appointments` (primary lookup by `id`) and `providerAppointments` (secondary index mapping `providerId -> Set<appointmentId>` for $O(K)$ conflict checks per provider rather than $O(N)$ global scans).
* **Concurrency Control:** `_withProviderLock(providerId, task)` chains promises per `providerId`. Even across asynchronous storage boundaries, concurrent bookings for the same provider execute serially (eliminating Check-Then-Act / TOCTOU race conditions), while requests for distinct providers proceed without blocking one another.

## 5. Key Assumptions & Tradeoffs
* **Strict UTC Only:** Timestamps must explicitly carry `Z` or `±00:00` offsets; timestamps without offsets or in local time zones are rejected to prevent silent timezone bugs.
* **Cancelled Records Retained in Memory:** Cancelled appointments remain in the `Map` with `status: 'CANCELLED'` rather than being deleted so callers receive a clear `ConflictError` on duplicate cancellation requests.

## 6. Limitations & Follow-Up Risks
* **Single-Process Memory:** State is volatile across process restarts and local to a single Node.js instance. Moving to multi-instance production requires moving the invariant to a database constraint (e.g., PostgreSQL `EXCLUDE USING gist` with `tstzrange`) or distributed lock.
* **Memory Growth:** Retaining cancelled records indefinitely in `Map` would grow heap usage over time; a production version should archive or TTL-expire old cancelled records.
* **Linear Scan per Provider:** Checking all appointments for a single provider is $O(K)$ per provider; if a provider accumulates tens of thousands of historical bookings, indexing active intervals in an interval tree or sorted array would keep lookups $O(\log K)$.
