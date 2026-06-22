import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { api, type WorkflowDefinition } from "../lib/api.js";

interface Sample {
  id: string;
  label: string;
  hint: string;
  input: Record<string, unknown>;
}

// Each sample maps to a seeded customer + a distinct scenario, so the LLM
// classification, risk, and draft differ run to run.
const SAMPLES: Sample[] = [
  {
    id: "duplicate-charge",
    label: "Duplicate charge",
    hint: "Jordan · Pro · billing",
    input: {
      customerId: "cust_1024",
      email: "jordan@example.com",
      subject: "I was charged twice this month",
      message:
        "Hi, I just noticed two identical charges on my card for my Pro plan this month. " +
        "Please refund the duplicate as soon as possible.",
    },
  },
  {
    id: "outage",
    label: "Production outage",
    hint: "Priya · Enterprise · urgent",
    input: {
      customerId: "cust_2048",
      email: "priya@acme.io",
      subject: "Production is down — whole team cannot log in",
      message:
        "Our entire team has been unable to access the dashboard since this morning. " +
        "This is blocking our production operations. We need this fixed ASAP.",
    },
  },
  {
    id: "angry-billing",
    label: "Frustrated customer",
    hint: "Sofia · at-risk · churn risk",
    input: {
      customerId: "cust_4096",
      email: "sofia@northstar.co",
      subject: "Still being overcharged — extremely frustrated",
      message:
        "This is the third month in a row I've been charged incorrectly. I'm very frustrated " +
        "and seriously considering cancelling our account. Please sort this out.",
    },
  },
  {
    id: "feature-request",
    label: "Feature request",
    hint: "David · VIP · positive",
    input: {
      customerId: "cust_5120",
      email: "david@vertexpay.com",
      subject: "Feature request: SAML SSO",
      message:
        "Love the product — it's been great for our team! Would it be possible to add SAML " +
        "SSO for our organization? Any rough timeline would be helpful. Thanks!",
    },
  },
  {
    id: "general-question",
    label: "Upgrade question",
    hint: "Marcus · Free · general",
    input: {
      customerId: "cust_3071",
      email: "marcus.lee@freemail.com",
      subject: "Question about upgrading to Pro",
      message:
        "Hi, I'm currently on the free plan and wondering what the Pro plan includes and how " +
        "billing works. Thanks!",
    },
  },
];

const FEATURES = [
  { icon: "🧩", title: "Durable state machine", desc: "Every run, step and transition is persisted and inspectable." },
  { icon: "🔧", title: "Typed tool calls", desc: "Validated inputs & outputs, retries, and full audit logs." },
  { icon: "🔒", title: "Human-in-the-loop", desc: "High-impact actions pause for approve / reject / edit." },
  { icon: "📡", title: "Live observability", desc: "Run timeline streams over SSE as the agent works." },
];

export function WorkflowList() {
  const navigate = useNavigate();
  const { data: workflows, isLoading } = useQuery({
    queryKey: ["workflows"],
    queryFn: api.listWorkflows,
  });
  const { data: runs } = useQuery({ queryKey: ["runs"], queryFn: api.listRuns });

  const [activeSample, setActiveSample] = useState(SAMPLES[0].id);
  const [input, setInput] = useState(JSON.stringify(SAMPLES[0].input, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const loadSample = (s: Sample) => {
    setActiveSample(s.id);
    setInput(JSON.stringify(s.input, null, 2));
    setJsonError(null);
  };

  const createRun = useMutation({
    mutationFn: (definitionId: string) => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(input);
        setJsonError(null);
      } catch {
        setJsonError("Run input is not valid JSON.");
        throw new Error("invalid json");
      }
      return api.createRun(definitionId, parsed);
    },
    onSuccess: (run) => navigate(`/runs/${run.id}`),
  });

  return (
    <div className="page">
      <section className="hero">
        <span className="eyebrow">Agent workflow platform</span>
        <h1>
          Run, watch and control AI agents
          <br />
          that complete real business workflows.
        </h1>
        <p>
          Pick a workflow, start a run, and watch each step execute with full tool-call
          logs — pausing for your approval before any high-impact action.
        </p>
        <div className="feature-row">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature">
              <span className="feature-icon">{f.icon}</span>
              <div>
                <strong>{f.title}</strong>
                <p>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="workspace">
        <section className="col-main">
          <div className="section-head">
            <h2>Workflows</h2>
            <span className="count">{workflows?.length ?? 0}</span>
          </div>

          {isLoading && <div className="skeleton-card" />}

          {workflows?.map((wf) => (
            <WorkflowCard
              key={wf.id}
              wf={wf}
              busy={createRun.isPending && createRun.variables === wf.id}
              onStart={() => createRun.mutate(wf.id)}
            />
          ))}
          {createRun.isError && createRun.error?.message !== "invalid json" && (
            <p className="error">{(createRun.error as Error).message}</p>
          )}
        </section>

        <aside className="col-side">
          <div className="panel">
            <div className="section-head">
              <h3>Run input</h3>
              <span className="tag">JSON</span>
            </div>

            <div className="sample-row">
              {SAMPLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`sample-chip ${activeSample === s.id ? "active" : ""}`}
                  onClick={() => loadSample(s)}
                  title={s.hint}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setActiveSample("");
              }}
              rows={14}
              spellCheck={false}
            />
            {jsonError && <p className="error">{jsonError}</p>}
            <p className="hint">
              Pick a sample above or edit the JSON. 🔒 marks an approval-required step.
            </p>
          </div>

          <div className="panel">
            <div className="section-head">
              <h3>Recent runs</h3>
              <span className="count">{runs?.length ?? 0}</span>
            </div>
            {!runs?.length && <p className="hint">No runs yet — start one above.</p>}
            <div className="run-list">
              {runs?.map((r) => (
                <Link key={r.id} to={`/runs/${r.id}`} className="run-item">
                  <span className={`status-dot s-${r.status.toLowerCase()}`} />
                  <div className="run-item-body">
                    <strong>{r.definition.name}</strong>
                    <small>
                      {r._count.stepRuns} steps · {timeAgo(r.createdAt)}
                    </small>
                  </div>
                  <span className={`badge b-${r.status.toLowerCase()}`}>{label(r.status)}</span>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function WorkflowCard({
  wf,
  busy,
  onStart,
}: {
  wf: WorkflowDefinition;
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <div className="wf-card">
      <div className="wf-card-head">
        <div>
          <h3>{wf.name}</h3>
          <p className="muted">{wf.description}</p>
        </div>
        <button className="primary" onClick={onStart} disabled={busy}>
          {busy ? "Starting…" : "Start run"}
        </button>
      </div>

      <div className="flow">
        {wf.steps.map((s, i) => {
          const approval = wf.approvalRequiredTools.includes(s.tool);
          return (
            <div key={s.key} className="flow-node-wrap">
              <div className={`flow-node ${s.type === "LLM" ? "llm" : ""} ${approval ? "gate" : ""}`}>
                <span className="flow-kind">{approval ? "🔒" : s.type === "LLM" ? "✦" : "▸"}</span>
                <span className="flow-label">{s.name}</span>
              </div>
              {i < wf.steps.length - 1 && <span className="flow-arrow">→</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function label(status: string) {
  return status.replace("_", " ").toLowerCase();
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
