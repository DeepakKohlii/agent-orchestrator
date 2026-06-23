# API Reference

Base URL (dev): `http://localhost:4000`. The Vite dev server proxies `/api` and `/health`
to it, so the browser uses a single origin. All bodies are JSON.

**Error envelope** — every error returns a consistent shape
([`api/errors.ts`](../server/src/api/errors.ts)):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request", "details": { } } }
```

Codes: `VALIDATION_ERROR` (400, Zod failure with field details), `INTERNAL` (500), or a
domain code from a thrown `ApiError`.

---

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness + effective LLM provider / mock mode |
| GET | `/api/workflows` | List workflow definitions |
| GET | `/api/runs` | List recent runs (most recent 20) |
| POST | `/api/runs` | Create and start a run |
| GET | `/api/runs/:id` | Full run detail (steps, tool calls, approvals, events) |
| GET | `/api/runs/:id/events` | Event timeline only |
| GET | `/api/runs/:id/stream` | **SSE** live event stream for a run |
| POST | `/api/approvals/:id/decision` | Approve / reject (with optional edited payload) |
| GET | `/api/tasks` | List tasks created by `create_task` (the mock task inbox) |
| POST | `/api/mode` | Toggle runtime mock mode |

---

### GET `/health`

```json
{ "ok": true, "llmProvider": "groq", "model": "llama-3.3-70b-versatile",
  "mockMode": false, "canUseReal": true }
```

### GET `/api/workflows`

Returns the seeded definitions. Each: `{ id, name, description, triggerType, steps[],
allowedTools[], approvalRequiredTools[] }`, where a step is
`{ key, name, type: "TOOL"|"LLM", tool, dependsOn[] }`.

### POST `/api/runs`

Request:

```json
{
  "definitionId": "ck...",
  "input": {
    "customerId": "cust_1024",
    "email": "jordan@example.com",
    "subject": "I was charged twice this month",
    "message": "Please refund the duplicate."
  }
}
```

Validated by `CreateRunSchema`. Creates the run, materializes a `StepRun` per step, sets the
run `RUNNING`, kicks off the orchestrator **in the background**, and returns the run
immediately (status `RUNNING`) with `201`. Watch progress via SSE or polling.

### GET `/api/runs/:id`

Full run for the console:

```jsonc
{
  "id": "ck...", "status": "WAITING_APPROVAL", "currentStepKey": "create_task",
  "finalOutput": null, "startedAt": "…", "completedAt": null, "failedAt": null,
  "definition": { /* … */ },
  "stepRuns": [ { "stepKey": "search_profile", "status": "SUCCEEDED",
                  "input": {…}, "output": {…}, "retryCount": 0,
                  "toolCalls": [ { "toolName": "search_customer_profile",
                                   "status": "SUCCESS", "latencyMs": 514,
                                   "input": {…}, "output": {…} } ] } ],
  "approvals": [ { "id": "ck…", "status": "PENDING", "proposedAction": "create_task",
                   "reason": "…", "payload": {…}, "riskScore": 75, "riskNotes": "…" } ],
  "events": [ { "seq": 1, "type": "RUN_STARTED", "payload": {…}, "createdAt": "…" } ]
}
```

### GET `/api/runs/:id/stream` (SSE)

`Content-Type: text/event-stream`. Each event:

```
id: 7
event: STEP_SUCCEEDED
data: {"type":"STEP_SUCCEEDED","seq":7,"payload":{"stepKey":"classify"}}
```

On connect, the server **replays events after `Last-Event-ID`** (sent automatically by the
browser's `EventSource` on reconnect), so no event is missed across reconnects. The client
pairs this with a full `GET /api/runs/:id` on mount to rehydrate, then resumes the stream.

### POST `/api/approvals/:id/decision`

Request (validated by `ApprovalDecisionSchema`):

```json
{ "decision": "APPROVED", "editedPayload": { "title": "…", "replyBody": "…" }, "decidedBy": "reviewer" }
```

- `APPROVED` → records the decision (merging `editedPayload` if present), sets the step back
  to `PENDING` and the run to `RUNNING`, and re-enters `tick` in the background. Returns the
  updated run.
- `REJECTED` → step `SKIPPED`, run `FAILED`, `RUN_FAILED` event.

### GET `/api/tasks`

```json
[ { "id": "ck…", "title": "Follow up: …", "assignee": "support-team",
    "priority": "high", "status": "open", "replySubject": "…", "replyBody": "…",
    "runId": "ck…", "createdAt": "…" } ]
```

### POST `/api/mode`

```json
{ "mock": true }
```

Returns `{ mockMode, canUseReal, llmProvider, model }`. If no LLM key is configured, mock
stays forced on regardless. See [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Notes

- No authentication (out of scope per the brief).
- Run creation and approval are normal POSTs; only run *updates* stream (server→client),
  which is why **SSE** is used rather than WebSocket — see [ARCHITECTURE.md](ARCHITECTURE.md) §6.
