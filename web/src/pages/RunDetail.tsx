import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api, type StepRun, type Approval, type ToolCall } from "../lib/api.js";

interface CustomerProfile {
  customerId: string;
  name: string;
  email: string;
  company: string;
  plan: string;
  region: string;
  phone: string;
  tenureMonths: number;
  signupDate: string;
  openTickets: number;
  lifetimeValueUsd: number;
  accountStatus: string;
  paymentStatus: string;
  satisfactionScore: number;
  lastContactAt: string;
  notes: string;
}

export function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [live, setLive] = useState(false);

  const { data: run } = useQuery({
    queryKey: ["run", id],
    queryFn: () => api.getRun(id!),
    refetchInterval: (q) =>
      ["COMPLETED", "FAILED"].includes((q.state.data?.status as string) ?? "") ? false : 4000,
  });

  useEffect(() => {
    if (!id) return;
    const es = new EventSource(`/api/runs/${id}/stream`);
    const onAny = () => qc.invalidateQueries({ queryKey: ["run", id] });
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = onAny;
    ["STEP_STARTED", "STEP_SUCCEEDED", "TOOL_CALL_LOGGED", "APPROVAL_REQUESTED", "APPROVAL_DECIDED", "RUN_COMPLETED", "RUN_FAILED", "POLICY_DENIED"].forEach(
      (t) => es.addEventListener(t, onAny),
    );
    return () => es.close();
  }, [id, qc]);

  if (!run) return <div className="page"><div className="skeleton-card" /></div>;

  const pendingApproval = run.approvals.find((a) => a.status === "PENDING");
  const total = run.stepRuns.length;
  const done = run.stepRuns.filter((s) => s.status === "SUCCEEDED").length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const profile = run.stepRuns.find((s) => s.stepKey === "search_profile" && s.output)
    ?.output as CustomerProfile | undefined;

  return (
    <div className="page run-page">
      <header className="run-header">
        <div>
          <span className="eyebrow">Run · {run.id.slice(0, 8)}</span>
          <h1>{run.definition.name}</h1>
        </div>
        <div className="run-header-right">
          {live && <span className="live"><span className="live-dot" />live</span>}
          <span className={`badge big b-${run.status.toLowerCase()}`}>{label(run.status)}</span>
        </div>
      </header>

      <div className="progress">
        <div className="progress-bar" style={{ width: `${pct}%` }} />
        <span className="progress-label">{done} / {total} steps</span>
      </div>

      {pendingApproval && <ApprovalPanel approval={pendingApproval} runId={run.id} />}

      {profile && <CustomerCard profile={profile} />}

      <div className="workspace">
        <section className="col-main">
          <div className="section-head"><h2>Step timeline</h2></div>
          <div className="timeline">
            {run.stepRuns.map((sr, i) => (
              <StepNode key={sr.id} step={sr} last={i === run.stepRuns.length - 1} />
            ))}
          </div>

          {run.status === "COMPLETED" && (
            <div className="panel">
              <div className="section-head"><h3>Final output</h3></div>
              <pre className="json">{JSON.stringify(run.finalOutput, null, 2)}</pre>
            </div>
          )}
        </section>

        <aside className="col-side">
          <div className="panel">
            <div className="section-head">
              <h3>Event timeline</h3>
              <span className="count">{run.events.length}</span>
            </div>
            <div className="events">
              {[...run.events].reverse().map((e) => (
                <div key={e.id} className="event-row">
                  <span className="seq">#{e.seq}</span>
                  <span className={`etype ${eventTone(e.type)}`}>{pretty(e.type)}</span>
                  <span className="muted">{new Date(e.createdAt).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StepNode({ step, last }: { step: StepRun; last: boolean }) {
  return (
    <div className={`tl-item ${last ? "last" : ""}`}>
      <div className={`tl-marker s-${step.status.toLowerCase()}`}>{markerIcon(step.status)}</div>
      <div className="tl-card">
        <div className="tl-head">
          <strong>{titleize(step.stepKey)}</strong>
          <div className="tl-badges">
            {step.retryCount > 0 && <span className="badge b-waiting_approval">retries {step.retryCount}</span>}
            <span className={`badge b-${step.status.toLowerCase()}`}>{label(step.status)}</span>
          </div>
        </div>
        {step.error && <p className="error">{step.error}</p>}
        {step.toolCalls.map((tc) => <ToolCallRow key={tc.id} tc={tc} />)}
      </div>
    </div>
  );
}

function ToolCallRow({ tc }: { tc: ToolCall }) {
  return (
    <details className="toolcall">
      <summary>
        <span className="tc-name">🔧 {tc.toolName}</span>
        <span className={`badge b-${tc.status === "SUCCESS" ? "completed" : tc.status === "ERROR" ? "failed" : "running"}`}>
          {tc.status.toLowerCase()}
        </span>
        {tc.latencyMs != null && <span className="latency">{tc.latencyMs}ms</span>}
      </summary>
      <div className="kv">
        <span className="kv-label">input</span>
        <pre className="json">{JSON.stringify(tc.input, null, 2)}</pre>
      </div>
      {tc.output != null && (
        <div className="kv">
          <span className="kv-label">output</span>
          <pre className="json">{JSON.stringify(tc.output, null, 2)}</pre>
        </div>
      )}
      {tc.error && <p className="error">{tc.error}</p>}
    </details>
  );
}

function ApprovalPanel({ approval, runId }: { approval: Approval; runId: string }) {
  const qc = useQueryClient();
  const [edited, setEdited] = useState(JSON.stringify(approval.payload, null, 2));
  const [err, setErr] = useState<string | null>(null);

  const decide = useMutation({
    mutationFn: (vars: { decision: "APPROVED" | "REJECTED" }) => {
      let payload: Record<string, unknown> | undefined;
      if (vars.decision === "APPROVED") {
        try {
          payload = JSON.parse(edited);
        } catch {
          setErr("Edited payload is not valid JSON.");
          throw new Error("invalid json");
        }
      }
      return api.decideApproval(approval.id, vars.decision, payload);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["run", runId] }),
  });

  return (
    <div className="approval-card">
      <div className="approval-head">
        <span className="approval-icon">🔒</span>
        <div>
          <h3>Approval required — {approval.proposedAction}</h3>
          <p className="muted">{approval.reason}</p>
        </div>
        <div className={`risk risk-${riskLevel(approval.riskScore)}`}>
          <span>risk</span>
          <strong>{approval.riskScore}</strong>
        </div>
      </div>
      <p className="risk-notes">{approval.riskNotes}</p>
      <label className="field-label">Proposed payload — edit before approving if needed</label>
      <textarea value={edited} onChange={(e) => setEdited(e.target.value)} rows={8} spellCheck={false} />
      {err && <p className="error">{err}</p>}
      <div className="approval-actions">
        <button className="primary ok" onClick={() => decide.mutate({ decision: "APPROVED" })} disabled={decide.isPending}>
          ✓ Approve &amp; continue
        </button>
        <button className="danger" onClick={() => decide.mutate({ decision: "REJECTED" })} disabled={decide.isPending}>
          ✕ Reject run
        </button>
      </div>
    </div>
  );
}

function CustomerCard({ profile }: { profile: CustomerProfile }) {
  const initials = profile.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="customer-card">
      <div className="cc-avatar">{initials}</div>
      <div className="cc-body">
        <div className="cc-top">
          <div>
            <strong className="cc-name">{profile.name}</strong>
            <span className="cc-sub">
              {profile.company} · {profile.email}
            </span>
          </div>
          <div className="cc-tags">
            <span className={`badge plan-${profile.plan}`}>{profile.plan}</span>
            <span className={`badge acct-${profile.accountStatus}`}>
              {label(profile.accountStatus)}
            </span>
            {profile.paymentStatus === "overdue" && (
              <span className="badge b-failed">payment overdue</span>
            )}
          </div>
        </div>
        <div className="cc-stats">
          <Stat label="Lifetime value" value={`$${profile.lifetimeValueUsd.toLocaleString()}`} />
          <Stat label="Tenure" value={`${profile.tenureMonths} mo`} />
          <Stat label="Open tickets" value={String(profile.openTickets)} />
          <Stat label="CSAT" value={`${profile.satisfactionScore}/100`} />
          <Stat label="Region" value={profile.region} />
          <Stat label="Customer ID" value={profile.customerId} mono />
        </div>
        {profile.notes && <p className="cc-notes">📝 {profile.notes}</p>}
      </div>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="cc-stat">
      <span className="cc-stat-label">{label}</span>
      <span className={`cc-stat-value ${mono ? "mono" : ""}`}>{value}</span>
    </div>
  );
}

function label(s: string) { return s.replace(/_/g, " ").toLowerCase(); }
function pretty(s: string) { return s.replace(/_/g, " ").toLowerCase(); }
function titleize(s: string) { return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function markerIcon(s: string) {
  return { SUCCEEDED: "✓", FAILED: "✕", RUNNING: "●", WAITING_APPROVAL: "🔒", SKIPPED: "–", PENDING: "" }[s] ?? "";
}
function riskLevel(n: number) { return n >= 70 ? "high" : n >= 40 ? "med" : "low"; }
function eventTone(t: string) {
  if (t.includes("FAILED") || t.includes("DENIED")) return "tone-fail";
  if (t.includes("COMPLETED") || t.includes("SUCCEEDED")) return "tone-ok";
  if (t.includes("APPROVAL")) return "tone-warn";
  return "";
}
