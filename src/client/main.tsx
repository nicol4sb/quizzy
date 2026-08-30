import { StrictMode, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { QuizDashboard } from "./QuizDashboard";
import { PlayerJoin } from "./PlayerJoin";
import "./styles.css";

type Creator = { id: string; email: string; createdAt: string };

function App() {
  const [creator, setCreator] = useState<Creator>();
  const [mode, setMode] = useState<"register" | "login">("login");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/auth/me")
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { creator: Creator }).creator
          : undefined,
      )
      .then(setCreator)
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    const body = (await response.json()) as {
      creator?: Creator;
      error?: string;
    };
    if (response.ok && body.creator) setCreator(body.creator);
    else setError(body.error ?? "Something went wrong.");
    setSubmitting(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setCreator(undefined);
    setMode("login");
  }

  if (loading)
    return (
      <main className="shell">
        <p>Loading Quizzy…</p>
      </main>
    );

  if (creator) {
    return <QuizDashboard email={creator.email} onLogout={logout} />;
  }

  return (
    <main className="shell">
      <section className="card">
        <p className="eyebrow">Live quizzes, together</p>
        <h1>Quizzy</h1>
        <p>
          {mode === "register"
            ? "Create your creator account."
            : "Welcome back."}
        </p>
        <div className="tabs" role="group" aria-label="Authentication mode">
          <button
            className={mode === "register" ? "active" : "secondary"}
            onClick={() => {
              setMode("register");
              setShowPassword(false);
              setError("");
            }}
          >
            Register
          </button>
          <button
            className={mode === "login" ? "active" : "secondary"}
            onClick={() => {
              setMode("login");
              setShowPassword(false);
              setError("");
            }}
          >
            Log in
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <span className="password-field">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                minLength={12}
                required
              />
              {mode === "login" && (
                <button
                  type="button"
                  className="password-visibility"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  title={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M2.2 12s3.4-6 9.8-6 9.8 6 9.8 6-3.4 6-9.8 6-9.8-6-9.8-6Z" />
                    <circle cx="12" cy="12" r="2.8" />
                    {showPassword && <path d="m4 4 16 16" />}
                  </svg>
                </button>
              )}
            </span>
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button disabled={submitting}>
            {submitting
              ? "Please wait…"
              : mode === "register"
                ? "Create account"
                : "Log in"}
          </button>
        </form>
      </section>
    </main>
  );
}

function RootApp() {
  return window.location.pathname.startsWith("/join/") ? (
    <PlayerJoin code={window.location.pathname.split("/").at(-1) ?? ""} />
  ) : (
    <App />
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");

createRoot(root).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
);
