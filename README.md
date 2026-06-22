# Agent Workflow Orchestration & Observability Platform

A mini platform for running AI agents that use tools to complete business workflows —
with durable run state, a step state machine, typed tool-call logs, retries, human
approvals, and a real-time run console.

---

## TL;DR architecture

```
WorkflowDefinition (template)
        │  start run
        ▼
   WorkflowRun ──contains──▶ StepRuns ──emit──▶ ToolCalls
        │                        │
        │ pauses on              └── every action appends to ──▶ RunEvents (audit log)
        ▼
   Approval request  ──decision──▶ resume
```

The "agent" is a **deterministic state machine** that executes an ordered list of steps.
Some steps call a typed mock tool; some call an LLM for a *structured decision*. A single
`tick(runId)` function advances a run by one step and persists after every transition.
Pause/resume (for approvals) is just function re-entry.

This is the explicitly-allowed "fixed workflow with LLM-assisted steps" model — chosen so
that **reliability and observability** (most of the grade) win over model cleverness.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Node + TypeScript + Express | Small, no framework magic |
| Validation | Zod | One tool for API validation, tool I/O typing, **and** LLM output validation |
| DB | Postgres (Neon) via Prisma | Durable, cloud-deployable, typed client |
| LLM | Auto-detected: Anthropic → OpenAI → Groq → mock | All Zod-validated; swap with one env var |
| Real-time | SSE (no WebSockets) | One-way server→client updates; plain HTTP, auto-reconnect |
| Frontend | React + TS + Vite + React Query | Polling + SSE live updates |

### Why SSE and not WebSocket?
We only ever push run updates **down** to the browser; approvals and run creation are
normal POST requests. SSE is one-way server→client over plain HTTP, auto-reconnects in the
browser, and deploys anywhere. WebSocket would be strictly more complexity for no benefit.

### LLM provider auto-detection
At startup `llm/client.ts` picks the provider by which key is present:
`ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → `GROQ_API_KEY` → **mock mode** (deterministic).
Groq uses the OpenAI-compatible SDK (different baseURL), so there are only two real
adapters plus mock. Every adapter returns a plain object that is Zod-validated identically.

---

## Workflow state machine

### WorkflowRun
| From | Event | To |
|---|---|---|
| PENDING | start | RUNNING |
| RUNNING | next step needs approval | WAITING_APPROVAL |
| WAITING_APPROVAL | approved | RUNNING |
| WAITING_APPROVAL | rejected | FAILED |
| RUNNING | no steps left | COMPLETED |
| RUNNING | unrecoverable tool error | FAILED |

### StepRun
`PENDING → RUNNING → SUCCEEDED` | `RUNNING → WAITING_APPROVAL → (resume) RUNNING` |
`RUNNING → FAILED` | `WAITING_APPROVAL → SKIPPED` (on reject)

### Approval
`PENDING → APPROVED | REJECTED` (APPROVED may carry an `editedPayload`).

---

## Tool execution model

Every tool is a typed contract validated by Zod:

```ts
interface Tool<I, O> {
  name: string;
  inputSchema: ZodSchema<I>;
  outputSchema: ZodSchema<O>;
  requiresApproval: boolean;
  run(input: I, ctx): Promise<O>;
}
```

The executor wrapper: **validate input → log ToolCall(RUNNING) → run with retry/timeout →
validate output → log ToolCall(SUCCESS/ERROR) with latency**. Invalid input/output is a hard
error, never silently swallowed.

### Tool / agent boundary (safety)
The LLM **never** invokes tools. It only *returns data*. The orchestrator decides which tool
runs and checks an allow-list + approval/risk policy (`orchestrator/policy.ts`) before any
execution. Policy denials are logged as run events.

---

## Running locally

```bash
# 1. Backend
cd server
cp ../.env.example .env        # set DATABASE_URL (Neon) and optionally an LLM key
npm install
npx prisma migrate dev --name init
npm run seed                   # seed workflow templates + mock data
npm run dev                    # http://localhost:4000

# 2. Frontend
cd ../web
npm install
npm run dev                    # http://localhost:5173
```

No LLM key? It runs in **mock mode** automatically — the full demo works offline.

---

## Bonus extensions

- **C — Tool Policy Engine** ✅ allow-list + per-workflow rules + risk-threshold approvals,
  denials logged as events. (Wired into the `tick` loop.)
- **A — Real-time Streaming** ✅ SSE stream of run events; UI rehydrates full state on
  reconnect/refresh then resumes the stream.
- **B — Replay from checkpoint** — *designed for* (idempotency check prevents re-firing
  already-approved actions) but documented as a stretch.

---

## What would change for durable production execution

- `tick()` becomes a **durable job**: a queue (e.g. SQS/BullMQ) + workers instead of running
  inline on the HTTP request.
- **Idempotency keys** per (run, step) so retries/replays never double-execute side effects.
- **Optimistic locking** on a run `version` column to prevent concurrent ticks racing.
- At-least-once delivery + dedup instead of in-process SSE hub (use Redis pub/sub or a
  broker so multiple server instances can fan out events).
- Outbox pattern for `RunEvent` so event emission is transactional with state changes.

---

## Assumptions

- Single-user / no auth (out of scope per the brief).
- One tick per request/resume; no distributed workers.
- Mock tools write to the local DB instead of real CRM/ticketing systems.
