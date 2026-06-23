import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type Task } from "../lib/api.js";

export function TasksPage() {
  const { data: tasks, isLoading, isError } = useQuery({
    queryKey: ["tasks"],
    queryFn: api.listTasks,
  });

  return (
    <div className="page">
      <section className="hero">
        <span className="eyebrow">Mock task manager</span>
        <h1>Created tasks</h1>
        <p>
          Tasks the agent created via the <code>create_task</code> tool — each one was
          persisted only after a human approved it. This stands in for a real task system.
        </p>
      </section>

      <section>
        <div className="section-head">
          <h2>Tasks</h2>
          <span className="count">{tasks?.length ?? 0}</span>
        </div>

        {isLoading ? (
          <div className="run-grid">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="run-tile-skeleton" />
            ))}
          </div>
        ) : isError ? (
          <div className="error-box">Couldn't load tasks. Is the backend running?</div>
        ) : !tasks?.length ? (
          <div className="empty-runs">
            No tasks yet — approve a <code>create_task</code> step to create one.
          </div>
        ) : (
          <div className="task-list">
            {tasks.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  return (
    <div className="out-card">
      <div className="task-head">
        <strong className="task-title">{task.title}</strong>
        <div className="task-tags">
          <span className={`badge prio-${task.priority}`}>{task.priority}</span>
          <span className="badge b-completed">{task.status}</span>
        </div>
      </div>
      <div className="task-body">
        <p className="task-desc">{task.description}</p>
        <div className="task-meta">
          <span>👤 {task.assignee}</span>
          <span>🕑 {new Date(task.createdAt).toLocaleString()}</span>
          <code className="task-id">{task.id}</code>
          {task.runId && (
            <Link to={`/runs/${task.runId}`} className="task-run-link">
              view run →
            </Link>
          )}
        </div>
        {task.replyBody && (
          <details className="toolcall">
            <summary>
              <span className="tc-name">✉️ Drafted reply{task.replySubject ? `: ${task.replySubject}` : ""}</span>
            </summary>
            <div className="email-body" style={{ margin: "8px 12px 12px" }}>{task.replyBody}</div>
          </details>
        )}
      </div>
    </div>
  );
}
