import { Link, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./lib/api.js";

export default function App() {
  const { pathname } = useLocation();
  const onRun = pathname.startsWith("/runs/");
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health });

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">◆</span>
          <span className="brand-text">
            Agent Run Console
            <small>workflow orchestration &amp; observability</small>
          </span>
        </Link>

        <div className="topbar-right">
          {onRun && (
            <Link to="/" className="ghost-btn">
              ← All workflows
            </Link>
          )}
          {health && (
            <span className={`provider-chip ${health.ok ? "online" : "offline"}`}>
              <span className="dot" />
              {health.llmProvider === "mock" ? "mock mode" : health.llmProvider}
              <code>{health.model}</code>
            </span>
          )}
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
