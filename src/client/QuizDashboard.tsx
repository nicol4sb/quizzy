import { useCallback, useEffect, useState } from "react";
import { QuizEditor } from "./QuizEditor";
import { HostLobby } from "./HostLobby";
import { navigateTo, SiteHeader } from "./SiteHeader";
import { trackAnalytics } from "./analytics";
import {
  draftFromApi,
  newQuiz,
  clearAnonymousDraft,
  loadAnonymousDraft,
  quizPayload,
  saveAnonymousDraft,
  type ApiQuiz,
  type QuizDraft,
  type QuizSummary,
} from "./quizzes";

type Props = {
  email: string;
  isAdmin?: boolean;
  onLogout: () => Promise<void>;
};

function draftIsSavable(draft: QuizDraft): boolean {
  if (!draft.title.trim()) return false;
  const questions = draft.questions.filter(({ prompt }) => prompt.trim());
  return (
    questions.length > 0 &&
    questions.every((question) => {
      const answers = question.answers.filter(({ text }) => text.trim());
      return (
        answers.length >= 2 &&
        answers.filter(({ correct }) => correct).length === 1 &&
        Number.isInteger(question.points) &&
        question.points >= 1 &&
        Number.isInteger(question.timeLimitSeconds) &&
        question.timeLimitSeconds >= 5
      );
    })
  );
}

export function QuizDashboard({ email, isAdmin = false, onLogout }: Props) {
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [editing, setEditing] = useState<QuizDraft>();
  const [importAnonymousDraft, setImportAnonymousDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "queued"
  >("idle");
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
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      const draft = loadAnonymousDraft();
      setEditing(draft ?? newQuiz());
      setImportAnonymousDraft(Boolean(draft));
      if (!draft)
        trackAnalytics("create_started", { path: "/dashboard?new=1" });
    }
  }, []);
  async function editQuiz(id: string) {
    setError("");
    const response = await fetch(`/api/quizzes/${id}`);
    if (!response.ok) return setError("Could not load that quiz.");
    setEditing(
      draftFromApi(((await response.json()) as { quiz: ApiQuiz }).quiz),
    );
  }
  const saveQuiz = useCallback(
    async (draftOverride?: QuizDraft, explicit = false) => {
      const draft = draftOverride ?? editing;
      if (!draft) return;
      // Autosave should not surface validation errors while a creator is still
      // filling in a new question. Keep the partial draft local until it is
      // complete; an explicit form submission gives actionable guidance.
      if (!draftIsSavable(draft) && !explicit) return;
      if (!draftIsSavable(draft) && explicit) {
        setError(
          "Add at least two answers to every question and choose exactly one correct answer before saving.",
        );
        setSaveState("idle");
        return;
      }
      setSaveState("saving");
      setError("");
      const response = await fetch(
        draft.id ? `/api/quizzes/${draft.id}` : "/api/quizzes",
        {
          method: draft.id ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(quizPayload(draft)),
        },
      );
      const body = (await response.json()) as {
        quiz?: ApiQuiz;
        error?: string;
        pending?: boolean;
      };
      if (response.ok && body.quiz) {
        // Preserve the active editor tree/caret after a blur save. The server
        // response is authoritative for the id, while the local draft already
        // contains the edits that were just submitted.
        setEditing({ ...draft, id: body.quiz.id });
        if (!draft.id) clearAnonymousDraft();
        setSaveState(body.pending ? "queued" : "saved");
        trackAnalytics(draft.id ? "quiz_updated" : "quiz_created", {
          quizId: body.quiz.id,
          path: "/dashboard",
        });
        await loadQuizzes();
      } else {
        setSaveState("idle");
        setError(body.error ?? "Could not save the quiz.");
      }
    },
    [editing],
  );
  useEffect(() => {
    if (!importAnonymousDraft || !editing) return;
    setImportAnonymousDraft(false);
    void saveQuiz(editing);
  }, [editing, importAnonymousDraft, saveQuiz]);
  async function deleteQuiz(id: string) {
    if (!window.confirm("Delete this quiz permanently?")) return;
    setError("");
    setSaveState("idle");
    const response = await fetch(`/api/quizzes/${id}`, { method: "DELETE" });
    if (response.ok) {
      trackAnalytics("quiz_deleted", { quizId: id, path: "/dashboard" });
      setEditing(undefined);
      await loadQuizzes();
    } else {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Could not delete that quiz.");
    }
  }
  async function togglePublic(id: string, isPublic: boolean) {
    const update = await fetch(`/api/quizzes/${id}/visibility`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isPublic }),
    });
    if (!update.ok) {
      const body = (await update.json()) as { error?: string };
      return setError(body.error ?? "Could not update quiz visibility.");
    }
    // Updating visibility should not reload/re-sort the whole dashboard. The
    // list is ordered by updated_at, so a full refresh makes the clicked card
    // jump to another position and can look like a different quiz flashed.
    // Patch only the card that was acted on, preserving its position.
    const body = (await update.json()) as { isPublic?: boolean };
    setQuizzes((items) =>
      items.map((item) =>
        item.id === id
          ? { ...item, isPublic: body.isPublic ?? isPublic }
          : item,
      ),
    );
    trackAnalytics("visibility_changed", {
      quizId: id,
      path: "/dashboard",
      metadata: { isPublic: body.isPublic ?? isPublic },
    });
  }
  async function renameQuiz(id: string, title: string) {
    const response = await fetch(`/api/quizzes/${id}`);
    if (!response.ok) return setError("Could not load that quiz.");
    const draft = draftFromApi(
      ((await response.json()) as { quiz: ApiQuiz }).quiz,
    );
    const update = await fetch(`/api/quizzes/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(quizPayload({ ...draft, title })),
    });
    if (!update.ok) return setError("Could not save the quiz title.");
    await loadQuizzes();
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
    trackAnalytics("live_session_created", {
      quizId: id,
      liveSessionId: body.session.id,
      path: "/dashboard",
    });
    navigateTo(`/host/${body.session.id}`, { notify: false });
    setHostSessionId(body.session.id);
  }
  function closeLobby() {
    navigateTo("/dashboard", { replace: true, notify: false });
    setHostSessionId(undefined);
    void loadQuizzes();
  }
  if (hostSessionId)
    return <HostLobby sessionId={hostSessionId} onClose={closeLobby} />;
  if (editing)
    return (
      <main className="app-shell">
        <SiteHeader
          active="create"
          loggedIn
          isAdmin={isAdmin}
          email={email}
          onLogout={onLogout}
          onCreate={() => {
            trackAnalytics("create_started", { path: "/dashboard" });
            setEditing(newQuiz());
          }}
          onMyQuizzes={() => {
            setEditing(undefined);
            setError("");
          }}
        />
        <QuizEditor
          quiz={editing}
          error={error}
          onChange={(next) => {
            setEditing(next);
            setSaveState("idle");
          }}
          onDelete={() => deleteQuiz(editing.id!)}
          onSave={saveQuiz}
          saveState={saveState}
        />
      </main>
    );
  return (
    <main className="app-shell">
      <SiteHeader
        active="quizzes"
        loggedIn
        isAdmin={isAdmin}
        email={email}
        onLogout={onLogout}
        onCreate={() => {
          trackAnalytics("create_started", { path: "/dashboard" });
          setEditing(newQuiz());
        }}
      />
      <div className="dashboard-meta">
        <p className="dashboard-visibility-help">
          Private quizzes are playable only after you start a live session.
        </p>
      </div>
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
          <button
            onClick={() => {
              trackAnalytics("create_started", { path: "/dashboard" });
              setEditing(newQuiz());
            }}
          >
            Create your first quiz
          </button>
        </section>
      ) : (
        <section className="quiz-grid">
          {quizzes.map((quiz) => (
            <article className={`quiz-tile theme-${quiz.theme}`} key={quiz.id}>
              <button
                type="button"
                className="tile-delete danger-icon"
                title="Delete quiz"
                aria-label="Delete quiz"
                disabled={Boolean(quiz.activeSessionId)}
                onClick={() => void deleteQuiz(quiz.id)}
              >
                <span aria-hidden="true">×</span>
              </button>
              <input
                className="tile-title"
                aria-label={`Quiz title: ${quiz.title}`}
                value={quiz.title}
                maxLength={72}
                onChange={(event) =>
                  setQuizzes((items) =>
                    items.map((item) =>
                      item.id === quiz.id
                        ? { ...item, title: event.target.value }
                        : item,
                    ),
                  )
                }
                onBlur={(event) => {
                  const title = event.currentTarget.value.trim();
                  if (title) void renameQuiz(quiz.id, title);
                }}
              />
              <p>
                {quiz.questionCount}{" "}
                {quiz.questionCount === 1 ? "question" : "questions"}
              </p>
              <button
                type="button"
                className={`visibility-badge${quiz.isPublic ? " is-public" : ""}`}
                title={
                  quiz.isPublic
                    ? "Public quiz: anyone with its link can play"
                    : "Private quiz: players can join only after you start it"
                }
                aria-label={
                  quiz.isPublic ? "Make quiz private" : "Make quiz public"
                }
                disabled={Boolean(quiz.activeSessionId)}
                onClick={() => void togglePublic(quiz.id, !quiz.isPublic)}
              >
                {quiz.isPublic ? "Public" : "Private"}
              </button>
              <div className="tile-actions">
                {quiz.activeSessionId ? (
                  <button
                    className="tile-action-button tile-action-primary"
                    onClick={() => {
                      navigateTo(`/host/${quiz.activeSessionId}`, {
                        notify: false,
                      });
                      setHostSessionId(quiz.activeSessionId!);
                    }}
                  >
                    Open lobby
                  </button>
                ) : (
                  <button
                    className="tile-action-button tile-action-primary"
                    onClick={() => void launchQuiz(quiz.id)}
                  >
                    Launch
                  </button>
                )}
                <button
                  className="tile-action-button tile-action-secondary"
                  title={
                    quiz.activeSessionId
                      ? "Edit safely; changes apply after the active session"
                      : "Edit quiz"
                  }
                  onClick={() => void editQuiz(quiz.id)}
                >
                  Edit
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

export function AnonymousQuizEditor({
  onLogin,
}: {
  onLogin: (register: boolean) => void;
}) {
  const [quiz, setQuiz] = useState<QuizDraft>(() => {
    return loadAnonymousDraft() ?? newQuiz();
  });
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "queued" | "local"
  >("local");

  useEffect(() => {
    trackAnalytics("create_started", { path: "/create" });
  }, []);

  function updateDraft(next: QuizDraft) {
    setQuiz(next);
    saveAnonymousDraft(next);
    setSaveState("local");
    setError("");
  }

  async function saveDraft(draftOverride?: QuizDraft, explicit = false) {
    const draft = draftOverride ?? quiz;
    saveAnonymousDraft(draft);
    if (!explicit) {
      setSaveState("local");
      return;
    }
    if (!draftIsSavable(draft)) {
      setError(
        "Add at least two answers to every question and choose exactly one correct answer before saving.",
      );
      setSaveState("idle");
      return;
    }
    setError("");
    setSaveState("saved");
    onLogin(true);
  }

  return (
    <main className="app-shell">
      <SiteHeader active="create" loggedIn={false} onLogin={onLogin} />
      <p className="anonymous-editor-hint">
        Draft saved locally. Sign in to save it to your account.
      </p>
      <QuizEditor
        quiz={quiz}
        error={error}
        onChange={updateDraft}
        onSave={saveDraft}
        saveState={saveState}
        saveLabel="Save quiz"
      />
    </main>
  );
}
