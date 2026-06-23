# Trade-offs, Assumptions & Production Gaps

What was deliberately chosen, what's mocked, what's intentionally left out, and exactly what
would change to run this for real. Written to be defended line by line.

---

## 1. Key decisions (and the alternative I rejected)

| Decision | Why | Alternative considered |
|---|---|---|
| **Fixed workflow + LLM decision steps** (not an autonomous planner) | Brief prioritizes reliability/observability over cleverness; deterministic order is auditable and testable | LLM-as-planner choosing steps — more impressive, far less predictable/debuggable |
| **`tick` runs in-process, one step per call** | Simple, fully observable, easy to reason about for a take-home | Queue + workers from day one — correct for prod, overkill here (and out of scope) |
| **`tick` kicked off in the background** after run creation | UI navigates instantly and watches live; mirrors how a job would be enqueued | Awaiting the whole run in the POST — blocks the request for seconds |
| **SSE, not WebSocket** | Updates only flow server→client; SSE is plain HTTP with built-in reconnect | WebSocket — bidirectional complexity we don't need |
| **Postgres + Prisma** | Real durability to demo recovery; typed; deploys on Neon | SQLite/in-memory — less convincing for "durable execution" |
| **Approval gates on action risk, not LLM risk** | The governed model must not decide its own oversight (prompt-injection-safe) | Gate on the LLM's ticket riskScore — manipulable and noisy |
| **Zod everywhere** | One library for API, tool I/O, and LLM output validation + inferred types | Hand-rolled validators / separate libs |

---

## 2. What's mocked (and how faithfully)

The brief allows mocked tools. Here it's mocked *realistically*, not stubbed:

- **`search_customer_profile`** — a **real DB read** from a seeded `Customer` table. This is
  exactly the "SQL lookup / CRM call" a production tool would do; only the data source is local.
- **`create_task`** — a **real DB write** to a `Task` table, visible in the Tasks inbox and
  linked back to its run. Stands in for an external task manager.
- **LLM steps** — use the configured provider, or deterministic mock responses offline.

So the *shapes* of the side effects are real (read a record, write a record); only the
external systems are local stand-ins.

---

## 3. Assumptions

- **Single user, no auth** — out of scope per the brief; there's no tenancy or RBAC.
- **One `tick` per request/resume** — no concurrency control beyond this; see §4.
- **`buildInput` is hand-written per workflow** — mapping prior step outputs into the next
  step's input is explicit code per tool. Fine for two workflows; a generic version is
  described in §5.
- **LLM risk score is advisory** — used for prioritization/reviewer context, never as a gate.
- **Recent runs / tasks are capped** (20 / 50) — no pagination; sufficient for a demo.

---

## 4. What would change for durable production execution

This is the heart of "durable execution thinking." Today `tick` runs inline and in-process;
to run this at scale and survive failures:

1. **`tick` becomes a durable job.** Replace the in-process background call with a queue
   (BullMQ/SQS/Temporal). Each "advance the run" is an idempotent job; workers pull them.
   This survives process restarts, enables horizontal scaling, and decouples API latency
   from execution.

2. **Idempotency keys per (run, step, attempt).** So retries and replays never double-execute
   a side effect. The groundwork exists: before executing an approval-gated tool we check for
   an existing `APPROVED` approval, which is what prevents re-firing `create_task`. Production
   would generalize this to all side-effecting tools with a dedup key persisted on `ToolCall`.

3. **Optimistic locking / single-writer per run.** Add a `version` column to `WorkflowRun`
   and guard transitions with a compare-and-set, so two workers can't advance the same run
   concurrently and corrupt state. (Today the in-process model sidesteps this.)

4. **Transactional outbox for events.** Today `emit` writes a `RunEvent` and pushes to the
   in-memory SSE hub. With multiple instances, write the event in the same DB transaction as
   the state change (outbox), and fan out via Redis pub/sub or a broker so any instance can
   serve a client's SSE stream and no event is lost.

5. **Real timeouts with cancellation.** The executor times out a hung call, but JS can't
   cancel the in-flight request — production would thread an `AbortSignal` into the tool/LLM
   SDK so the work actually stops.

6. **Dead-letter / alerting** for runs that exhaust retries, plus metrics (run duration,
   step latency, approval wait time) exported to a real observability stack.

---

## 5. What I'd do next with more time (in priority order)

1. **Bonus B — Replay from checkpoint.** Restart a failed run from a chosen step, preserve
   old events, link old/new attempts with a `RUN_REPLAYED` event, and don't re-fire
   already-approved actions. The state model and idempotency check are already designed for
   it — this is the most natural next step and the strongest "durable execution" story.
2. **Schema-driven `buildInput`.** Declare each step's input mapping (JSONPath/template) on
   the `StepDef` so new workflows need no orchestrator code changes.
3. **Per-workflow input forms** generated from a JSON schema, replacing the raw-JSON box.
4. **Richer policy conditions** (e.g. amount thresholds, time-of-day, per-role approvers).
5. **AuthN/Z** and multi-tenancy.

---

## 6. Known limitations (honest list)

- No auth; anyone with the URL can run/approve.
- In-memory SSE hub → a run's stream only works on the instance handling it (fine for
  single-instance dev).
- `buildInput` coupling means a new workflow may require a small code edit.
- Integration tests hit a real DB and are slow against remote Neon (a local Postgres makes
  them near-instant); they self-skip without `DATABASE_URL`.
- Replay (Bonus B) is designed-for but not built.

See also [ARCHITECTURE.md](ARCHITECTURE.md).
