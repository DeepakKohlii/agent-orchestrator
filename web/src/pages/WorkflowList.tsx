import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { api, type WorkflowDefinition } from "../lib/api.js";

const SAMPLE_INPUT = {
  customerId: "cust_1024",
  email: "jordan@example.com",
  subject: "I was charged twice this month",
  message:
    "Hi, I just noticed two identical charges on my card for my Pro plan this month. " +
    "Please refund the duplicate as soon as possible.",
};

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
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health });

  const [input, setInput] = useState(JSON.stringify(SAMPLE_INPUT, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

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
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={14}
              spellCheck={false}
            />
            {jsonError && <p className="error">{jsonError}</p>}
            <p className="hint">
              Shared across runs. 🔒 marks an approval-required step.
            </p>
            {health?.mockMode ? (
              <p className="hint">
                Mock mode — CRM lookup is skipped; a fixed demo profile is used.
              </p>
            ) : (
              <p className="hint">
                Try different customers — seeded IDs:{" "}
                <code>cust_1024</code>, <code>cust_2048</code> (overdue enterprise),{" "}
                <code>cust_4096</code> (at-risk), <code>cust_5120</code> (VIP),{" "}
                <code>cust_3071</code> (free).
              </p>
            )}
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
