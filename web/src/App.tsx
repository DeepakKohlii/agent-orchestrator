import { useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./lib/api.js";

export default function App() {
  const { pathname } = useLocation();
  const onRun = pathname.startsWith("/runs/");
  const qc = useQueryClient();
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health });

  const [toast, setToast] = useState<{ msg: string; tone: "info" | "warn" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const showToast = (msg: string, tone: "info" | "warn" = "info") => {
    setToast({ msg, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const toggleMode = useMutation({
    mutationFn: (mock: boolean) => api.setMode(mock),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["health"] });
      showToast(
        res.mockMode
          ? "Switched to mock mode — LLM responses are deterministic (no API calls)."
          : `Switched to live mode — using ${res.llmProvider}.`,
        res.mockMode ? "warn" : "info",
      );
    },
  });

  const mock = health?.mockMode ?? true;
  const lockedMock = health ? !health.canUseReal : false;

  const handleToggle = () => {
    if (lockedMock) {
      showToast(
        "Running in mock mode. Set an LLM API key (ANTHROPIC_API_KEY, OPENAI_API_KEY, " +
          "or GROQ_API_KEY) in server/.env and restart to enable live mode.",
        "warn",
      );
      return;
    }
    toggleMode.mutate(!mock);
  };

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
            <button
              className={`mode-toggle ${mock ? "is-mock" : "is-live"}`}
              onClick={handleToggle}
              disabled={toggleMode.isPending}
              title={
                lockedMock
                  ? "No LLM key configured — locked to mock mode"
                  : mock
                    ? "Mock mode: LLM responses are deterministic (no API calls). Click to use the real provider."
                    : `Live: ${health.llmProvider}. Click to switch to mock mode.`
              }
            >
              <span className={`mode-dot ${mock ? "" : "live"}`} />
              {mock ? "Mock mode" : "Live mode"}
              {lockedMock && <span className="lock">🔒</span>}
            </button>
          )}

          {health && (
            <span className={`provider-chip ${health.ok ? "online" : "offline"}`}>
              <span className="dot" />
              {health.mockMode ? "mock" : health.llmProvider}
              <code>{health.model}</code>
            </span>
          )}
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      {toast && (
        <div className={`toast toast-${toast.tone}`} role="status" onClick={() => setToast(null)}>
          <span className="toast-icon">{toast.tone === "warn" ? "⚠️" : "✓"}</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
