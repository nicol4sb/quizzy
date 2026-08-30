import { useEffect, useState } from "react";
import { QuizEditor } from "./QuizEditor";
import { HostLobby } from "./HostLobby";
import {
  draftFromApi,
  newQuiz,
  quizPayload,
  type ApiQuiz,
  type QuizDraft,
  type QuizSummary,
} from "./quizzes";

type Props = { email: string; onLogout: () => Promise<void> };
export function QuizDashboard({ email, onLogout }: Props) {
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [editing, setEditing] = useState<QuizDraft>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const initialSession = window.location.pathname.match(
    /^\/host\/([0-9a-f-]+)$/i,
  )?.[1];
  const [hostSessionId, setHostSessionId] = useState<string | undefined>(
    initialSession,
  );
  async function loadQuizzes() {
    const response = await fetch("/api/quizzes");
    if (response.ok)
      setQuizzes(
        ((await response.json()) as { quizzes: QuizSummary[] }).quizzes,
      );
    setLoading(false);
  }
  useEffect(() => {
    void loadQuizzes();
  }, []);
  async function editQuiz(id: string) {
    setError("");
    const response = await fetch(`/api/quizzes/${id}`);
    if (!response.ok) return setError("Could not load that quiz.");
    setEditing(
      draftFromApi(((await response.json()) as { quiz: ApiQuiz }).quiz),
    );
  }
  async function saveQuiz() {
    if (!editing) return;
    setSaving(true);
    setError("");
    const response = await fetch(
      editing.id ? `/api/quizzes/${editing.id}` : "/api/quizzes",
      {
        method: editing.id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(quizPayload(editing)),
      },
    );
    const body = (await response.json()) as { quiz?: ApiQuiz; error?: string };
    if (response.ok && body.quiz) {
      setEditing(undefined);
      await loadQuizzes();
    } else setError(body.error ?? "Could not save the quiz.");
    setSaving(false);
  }
  async function deleteQuiz(id: string) {
    if (!window.confirm("Delete this quiz permanently?")) return;
    setError("");
    const response = await fetch(`/api/quizzes/${id}`, { method: "DELETE" });
    if (response.ok) await loadQuizzes();
    else {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Could not delete that quiz.");
    }
  }
  async function launchQuiz(id: string) {
    setError("");
    const response = await fetch(`/api/quizzes/${id}/sessions`, {
      method: "POST",
    });
    const body = (await response.json()) as {
      session?: { id: string };
      error?: string;
    };
    if (!response.ok || !body.session)
      return setError(body.error ?? "Could not launch the quiz.");
    window.history.pushState({}, "", `/host/${body.session.id}`);
    setHostSessionId(body.session.id);
  }
  function closeLobby() {
    window.history.pushState({}, "", "/");
    setHostSessionId(undefined);
    void loadQuizzes();
  }
  if (hostSessionId)
    return <HostLobby sessionId={hostSessionId} onClose={closeLobby} />;
  if (editing)
    return (
      <main className="app-shell">
        <QuizEditor
          quiz={editing}
          saving={saving}
          error={error}
          onChange={setEditing}
          onCancel={() => {
            setEditing(undefined);
            setError("");
          }}
          onSave={saveQuiz}
        />
      </main>
    );
  return (
    <main className="app-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Creator dashboard</p>
          <h1>Your quizzes</h1>
          <p>Signed in as {email}</p>
        </div>
        <div className="header-actions">
          <button onClick={() => setEditing(newQuiz())}>Create quiz</button>
          <button className="secondary" onClick={() => void onLogout()}>
            Log out
          </button>
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading quizzes…</p>
      ) : quizzes.length === 0 ? (
        <section className="empty-state">
          <h2>Your first quiz starts here</h2>
          <p>Add questions, possible answers, timing, and scores.</p>
          <button onClick={() => setEditing(newQuiz())}>
            Create your first quiz
          </button>
        </section>
      ) : (
        <section className="quiz-grid">
          {quizzes.map((quiz) => (
            <article className="quiz-tile" key={quiz.id}>
              <p className="theme-label">{quiz.theme.replace("-", " ")}</p>
              <h2>{quiz.title}</h2>
              <p>
                {quiz.questionCount}{" "}
                {quiz.questionCount === 1 ? "question" : "questions"}
              </p>
              <div className="tile-actions">
                {quiz.activeSessionId ? (
                  <button
                    onClick={() => {
                      window.history.pushState(
                        {},
                        "",
                        `/host/${quiz.activeSessionId}`,
                      );
                      setHostSessionId(quiz.activeSessionId!);
                    }}
                  >
                    Open lobby
                  </button>
                ) : (
                  <button onClick={() => void launchQuiz(quiz.id)}>
                    Launch
                  </button>
                )}
                <button
                  className="secondary"
                  disabled={Boolean(quiz.activeSessionId)}
                  onClick={() => void editQuiz(quiz.id)}
                >
                  Edit
                </button>
                <button
                  className="danger"
                  disabled={Boolean(quiz.activeSessionId)}
                  onClick={() => void deleteQuiz(quiz.id)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
