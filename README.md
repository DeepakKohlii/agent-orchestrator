# Agent Workflow Orchestration & Observability Platform

A mini platform for running AI agents that use tools to complete business workflows —
with a durable state machine, typed tool execution, full audit logs, retries, **human
approval before high-impact actions**, and a real-time run console.

---

## What it does

Two operational support workflows ship seeded and ready to run:

- **Support Ticket Triage** — look up the customer → classify the ticket (LLM) → assess
  account risk (LLM) → create an internal follow-up task *(requires approval)*.
- **Customer Follow-up Drafting** — look up the customer → classify (LLM) → draft a reply
  (LLM) → create a task to send the reply *(requires approval)*.

You start a run from the console, watch each step execute live with full tool-call logs,
and the run **pauses for your approval** before the high-impact action. You can approve,
edit the payload, or reject — and everything is recorded in an append-only timeline.

### The end-to-end demo loop

```
pick workflow + sample input → start run
   → search_profile → classify → (summarize | draft)   [steps stream live via SSE]
   → create_task is high-impact → run PAUSES, approval requested
   → reviewer approves / edits / rejects
   → on approve: task is persisted to the Task table (real, visible side effect)
   → run completes; final output + full audit trail shown; task appears in the Tasks inbox
```

---

## Architecture at a glance

```
WorkflowDefinition (template)
        │  POST /api/runs (+ input)
        ▼
   WorkflowRun ──contains──▶ StepRun ──calls──▶ ToolCall
        │                       │
        │  pauses on            └── every action appends to ──▶ RunEvent (audit log + SSE)
        ▼
   Approval ──decision──▶ resume / terminate
```

The "agent" is a **deterministic state machine**. A single `tick(runId)` function advances
a run by one step, persisting after every transition. Some steps call typed mock tools;
some call an LLM for a *validated structured decision*. Pause/resume (for approvals) is
just function re-entry — the entire run state lives in the database, so it's recoverable.

This is the brief's explicitly-allowed *"fixed workflow with LLM-assisted steps"* model,
chosen so reliability and observability win over autonomous-planning cleverness.

**📚 Full details in [`docs/`](docs/) — start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).**

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Node + TypeScript + **Express** | Small, explicit, no framework magic |
| Validation | **Zod** | One tool for API validation, tool I/O typing, **and** LLM output validation |
| Database | **Postgres (Neon)** via **Prisma** | Durable, cloud-deployable, typed client |
| LLM | Auto-detected: **Anthropic → OpenAI → Groq → mock** | All Zod-validated; switch with one env var |
| Real-time | **SSE** (no WebSockets) | One-way server→client updates over plain HTTP; auto-reconnect |
| Frontend | **React + TS + Vite + React Query** | Polling + SSE live updates |
| Tests | **Vitest** | Unit (offline) + DB-gated integration |

---

## Quick start

**Prerequisites:** Node 18+, a Postgres connection string (a free [Neon](https://neon.tech)
branch works). An LLM key is **optional** — without one the app runs in deterministic mock
mode and the whole demo still works offline.

```bash
# 1) Backend
cd server
cp ../.env.example .env          # set DATABASE_URL; optionally add ONE LLM key
npm install                      # also runs `prisma generate` (postinstall)
npx prisma migrate dev --name init
npm run seed                     # seed 2 workflows + mock CRM customers
npm run dev                      # http://localhost:4000

# 2) Frontend (new terminal)
cd web
npm install
npm run dev                      # http://localhost:5173
```

Open **http://localhost:5173**, pick a sample input, and start a run.

### LLM provider (auto-detected)

Set **one** key in `server/.env`; the provider is chosen at startup by priority:

```
ANTHROPIC_API_KEY  →  OPENAI_API_KEY  →  GROQ_API_KEY  →  mock mode (no key)
```

You can also flip **mock mode** at runtime from the nav toggle.

---

## Project layout

```
server/    Express API, Prisma schema, the orchestrator, tools, and LLM client
web/       React run console (workflow list, run detail, tasks inbox)
docs/      Architecture, API reference, and trade-offs
```

The `server/src/orchestrator` folder is the heart of it: the state machine, the step engine,
the tool executor, and the policy/approval logic.

---

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how the system fits together and why.
- **[docs/API.md](docs/API.md)** — REST + SSE endpoint reference.
- **[docs/TRADEOFFS.md](docs/TRADEOFFS.md)** — decisions, what's mocked, and production gaps.

---

## Deployment

Backend on **Render** (free), frontend on **Vercel** (free), database on **Neon**.

- **Backend (Render):** a [`render.yaml`](render.yaml) blueprint is included — it builds
  `server/`, runs `prisma migrate deploy` + seed, and starts the API. Set `DATABASE_URL`
  (and optionally one LLM key) in the dashboard. *(Free instances sleep after ~15 min idle,
  so the first request after a pause is slow — ping it before demoing.)*
- **Frontend (Vercel):** import the repo with root directory `web/`. Set **`VITE_API_URL`**
  to the Render backend URL. [`web/vercel.json`](web/vercel.json) handles SPA routing.

Locally you set **nothing** for the frontend — `VITE_API_URL` is unset, so requests stay
relative and the Vite dev server proxies them to `localhost:4000` automatically.

## Deployment

Backend on **Render** (free), frontend on **Vercel** (free), database on **Neon**.

- **Backend (Render):** a [`render.yaml`](render.yaml) blueprint is included — it builds
  `server/`, runs `prisma migrate deploy` + seed, and starts the API. Connect the repo as a
  Blueprint and set `DATABASE_URL` (and optionally one LLM key) in the dashboard. *Free
  instances sleep after ~15 min idle, so the first request after a pause is slow — ping the
  `/health` URL before demoing.*
- **Frontend (Vercel):** import the repo with root directory `web/`, then set **`VITE_API_URL`**
  to the Render backend URL. [`web/vercel.json`](web/vercel.json) handles SPA routing.

Locally you set **nothing** for the frontend — `VITE_API_URL` is unset, so requests stay
relative and the Vite dev server proxies them to `localhost:4000` automatically.

## Testing

```bash
cd server && npm test          # vitest
```

| Suite | Covers |
|---|---|
| `stateMachine.test.ts` | Run + step transition matrix; illegal transitions throw |
| `tools.test.ts` | Tool input validation, approval flags, registry, LLM output validity (mock) |
| `policy.test.ts` | Allow-list denial, approval via flag/list, risk-threshold, dynamic override |
| `integration.run.test.ts` | **Full run with approval** (pause → approve → complete) + reject → fail; audit trail + idempotency |

Unit suites are pure and run offline (force mock mode). The integration suite runs against
a real Postgres and **self-skips when `DATABASE_URL` is unset**.

---

## Bonus extensions

- **C — Tool Policy Engine** ✅ allow-list + per-workflow rules + risk-threshold approval; denials logged as events.
- **A — Real-time Streaming** ✅ SSE event stream; UI rehydrates full state on reconnect, then resumes.
- **B — Replay from checkpoint** — *not implemented* (designed-for; the idempotency guard that
  prevents re-firing approved actions already exists). See [docs/TRADEOFFS.md](docs/TRADEOFFS.md).

---

## Assumptions

- Single-user; no authentication (out of scope per the brief).
- One `tick` runs in-process per request/resume — no distributed queue/workers (see trade-offs).
- Tools are mocked: `search_customer_profile` reads a seeded `Customer` table, `create_task`
  writes a real `Task` row, and the LLM steps use the configured provider or mock mode.
- `buildInput` (mapping a step's input from prior outputs) is hand-written per workflow — a
  documented simplification; a generic mapping is described in the trade-offs doc.

Full rationale and production gaps: **[docs/TRADEOFFS.md](docs/TRADEOFFS.md)**.
