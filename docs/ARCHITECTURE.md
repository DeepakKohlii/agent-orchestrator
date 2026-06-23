# Architecture

This explains how the system is put together and why. For endpoints see [API.md](API.md);
for the decisions and production gaps see [TRADEOFFS.md](TRADEOFFS.md).

## The idea

The brief is clear that the interesting part is the *infrastructure around* an agent —
durable state, auditing, retries, human approval — not an autonomous planner. So the agent
here is a **deterministic state machine** that walks an ordered set of steps. Some steps call
typed tools; some ask an LLM for a structured decision. The LLM is a component inside a step,
never the thing driving control flow.

That choice (a fixed workflow with LLM-assisted steps, which the brief explicitly allows) is
what makes runs reproducible, inspectable, and recoverable — the qualities being graded.

## The pieces

```
React console ──REST + SSE──► Express API ──► run service ──► tick (the engine)
                                                                 │
                                          policy ◄───────────────┤  (allow-list / approval)
                                          executor ◄─────────────┤  (validate, log, retry, timeout)
                                          tools ──► LLM client    │
                                                                 ▼
                          every state change ──► event log (audit) ──► SSE to the browser
                                                                 │
                                                            Postgres
```

A run moves through the system like this: the API validates the request and asks the run
service to create a run; the engine advances it one step at a time; each step either calls a
tool directly or, for a high-impact action, pauses for approval; everything that happens is
written to an append-only event log and streamed to the browser.

The layers stay honest about their jobs: the API never reaches into the engine, the engine
never builds HTTP responses, and tools never decide policy — the orchestrator does. That
separation is what keeps the thing debuggable.

## Runs, steps, and events

A **workflow definition** is a template — an ordered list of steps with the tools they may
use and which ones need approval. A **run** is one execution of a template against a specific
input. Each step execution, each tool call, each approval, and each state transition is its
own persisted record, and every meaningful action also appends to a per-run **event log**.

The event log is the backbone of observability: the timeline you see in the console and the
live SSE stream are both just projections of it. Because it's append-only with a monotonic
sequence number, a browser can reconnect and replay only what it missed.

State isn't a free-form string. Runs and steps have explicit allowed transitions, and an
illegal move (say, `COMPLETED → RUNNING`) throws rather than silently corrupting state. That
turns the state machine from a diagram into an actual invariant, and makes it unit-testable on
its own.

```
Run:   PENDING → RUNNING ⇄ WAITING_APPROVAL → COMPLETED | FAILED
Step:  PENDING → RUNNING ⇄ WAITING_APPROVAL → SUCCEEDED | FAILED | SKIPPED
```

## The engine

The core is one function that advances a run by a single step and persists after each
transition:

```
load the run
pick the next step whose dependencies are all done
build its input from the run input + earlier steps' outputs
check policy — is this tool allowed? does it need approval?
   not allowed      → record a denial, fail the step
   needs approval   → create an approval request, pause, and return
   otherwise        → execute the tool, store the output, move on
when no steps remain → the run is complete
```

The elegant part is **pause/resume**. Pausing for approval is just the function returning
early; the whole run lives in the database. When a reviewer approves, the step is re-queued
and the function is called again — it sees the approval already exists, skips the gate, and
executes. So resuming is re-entering the same code path, and the server could restart between
pause and approval with nothing lost.

Run creation kicks the engine off in the background and returns immediately, so the UI
navigates straight to the run and watches it progress live instead of the request hanging
until the run finishes. That background call is exactly the seam where, in production, the
engine would become a queued durable job.

## Safe tool execution

Every tool declares its input and output shapes (Zod), so the executor validates the input
before running it and the output after — a tool can neither run on garbage nor return
garbage into run state. Each call is logged win or lose (with latency and any error), failures
are retried a couple of times and then surface as a failed step (never swallowed), and a hung
tool or model call is cut off by a timeout so it can't stall a run.

## Keeping the agent in bounds

Two independent guards, both deterministic:

1. **The LLM can't call tools.** It only returns validated data; the orchestrator decides
   what actually runs. There's no path for prompt content to trigger an action.
2. **An allow-list per workflow.** Before anything executes, the tool is checked against the
   tools that workflow is permitted to use; anything off-list is blocked and logged.

Approval is gated on what an *action* does — a write like creating a task is high-impact and
needs sign-off — not on the risk score the LLM assigned the ticket. The model's own judgment
is shown to the reviewer as context, but it never decides whether it needs oversight; letting
the governed thing lower its own guardrails would be manipulable via prompt injection.

## LLM integration

Every LLM step goes through one helper that returns a schema-validated object. If the model's
output doesn't match the schema, it re-asks once with the error, then gives up rather than
passing along something malformed. The provider is picked from whichever API key is present
(Anthropic, OpenAI, or Groq), and with no key — or via a toggle in the UI — it runs in a
deterministic mock mode so the whole product works offline. Validation, a repair retry, mock
fallback, and provider fallback are the "pragmatic with fallback paths" the brief asks for.

## Storage

Postgres via Prisma. Structured fields (statuses, timestamps, relationships) stay queryable;
the heterogeneous, evolving bits (step inputs/outputs, event payloads) are JSON. Two extra
tables stand in for external systems the tools talk to — a customer table the profile lookup
reads, and a task table the approved action writes to — so the mocked side effects are real,
visible rows rather than stubs.
