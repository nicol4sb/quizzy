import QRCode from "qrcode";
import { useEffect, useState } from "react";
import {
  type AnswerProgress,
  type LeaderboardEntry,
  type LiveQuestion,
  type LiveResults,
  useCountdown,
} from "./live";
import { Podium, ResultsView } from "./ResultsView";

type Session = {
  id: string;
  quizTitle: string;
  joinCode: string;
  joinPath: string;
  state: string;
  revision: number;
};
type Player = { id: string; nickname: string; joinedAt: string };
type Props = { sessionId: string; onClose: () => void };

export function HostLobby({ sessionId, onClose }: Props) {
  const [session, setSession] = useState<Session>();
  const [qrCode, setQrCode] = useState("");
  const [joinOrigin, setJoinOrigin] = useState(window.location.origin);
  const [players, setPlayers] = useState<Player[]>([]);
  const [question, setQuestion] = useState<LiveQuestion>();
  const [progress, setProgress] = useState<AnswerProgress>({
    answeredCount: 0,
    totalPlayers: 0,
  });
  const [starting, setStarting] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [results, setResults] = useState<LiveResults>();
  const [finalLeaderboard, setFinalLeaderboard] =
    useState<LeaderboardEntry[]>();
  const [error, setError] = useState("");
  const secondsRemaining = useCountdown(question?.closesAt);

  useEffect(() => {
    async function loadSnapshot() {
      const response = await fetch(`/api/sessions/${sessionId}/host`);
      if (!response.ok) {
        setError("This lobby could not be loaded.");
        return;
      }
      const snapshot = (await response.json()) as {
        session: Session;
        players: Player[];
        currentQuestion?: LiveQuestion;
        answerProgress?: AnswerProgress;
        results?: LiveResults;
        leaderboard?: LeaderboardEntry[];
      };
      const loaded = snapshot.session;
      setSession(loaded);
      setPlayers(snapshot.players);
      setQuestion(snapshot.currentQuestion);
      setProgress(
        snapshot.answerProgress ?? {
          answeredCount: 0,
          totalPlayers: snapshot.players.length,
        },
      );
      setResults(snapshot.results);
      setFinalLeaderboard(snapshot.leaderboard);
      const runtimeResponse = await fetch(
        `/api/runtime?browserOrigin=${encodeURIComponent(window.location.origin)}`,
      );
      const runtime = runtimeResponse.ok
        ? ((await runtimeResponse.json()) as { joinOrigin: string })
        : { joinOrigin: window.location.origin };
      setJoinOrigin(runtime.joinOrigin);
      setQrCode(
        await QRCode.toDataURL(`${runtime.joinOrigin}${loaded.joinPath}`, {
          width: 360,
          margin: 2,
          color: { dark: "#111026", light: "#ffffff" },
        }),
      );
    }

    void loadSnapshot();
    const url = new URL("/ws", window.location.href);
    url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("sessionId", sessionId);
    url.searchParams.set("role", "host");
    const socket = new WebSocket(url);
    socket.addEventListener("message", (message) => {
      const event = JSON.parse(message.data as string) as {
        type: string;
        revision?: number;
        payload?: {
          players?: Player[];
          question?: LiveQuestion;
          roundId?: string;
          answeredCount?: number;
          totalPlayers?: number;
          results?: LiveResults;
          leaderboard?: LeaderboardEntry[];
        };
      };
      const payload = event.payload;
      if (event.type === "connected") void loadSnapshot();
      if (event.type === "lobby_updated" && payload?.players) {
        setPlayers(payload.players);
        setProgress((current) => ({
          ...current,
          totalPlayers: payload.players!.length,
        }));
        if (event.revision)
          setSession((current) =>
            current ? { ...current, revision: event.revision! } : current,
          );
      }
      if (event.type === "question_opened" && payload?.question) {
        setQuestion(payload.question);
        setResults(undefined);
        setProgress((current) => ({ ...current, answeredCount: 0 }));
        setSession((current) =>
          current
            ? {
                ...current,
                state: "QUESTION_OPEN",
                revision: event.revision ?? current.revision,
              }
            : current,
        );
      }
      if (
        event.type === "answer_count_updated" &&
        payload?.answeredCount !== undefined &&
        payload.totalPlayers !== undefined
      )
        setProgress({
          answeredCount: payload.answeredCount,
          totalPlayers: payload.totalPlayers,
        });
      if (event.type === "results_revealed" && payload?.results) {
        setResults(payload.results);
        setSession((current) =>
          current
            ? {
                ...current,
                state: "RESULTS",
                revision: event.revision ?? current.revision,
              }
            : current,
        );
      }
      if (event.type === "quiz_finished" && payload?.leaderboard) {
        setFinalLeaderboard(payload.leaderboard);
        setSession((current) =>
          current
            ? {
                ...current,
                state: "FINISHED",
                revision: event.revision ?? current.revision,
              }
            : current,
        );
      }
      if (event.type === "session_ended") onClose();
    });
    return () => socket.close();
  }, [sessionId]);

  async function cancel() {
    if (
      !window.confirm(
        "Cancel this quiz for everyone? This live run and its answers will be discarded.",
      )
    )
      return;
    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: "DELETE",
    });
    if (response.ok) onClose();
    else setError("The quiz could not be cancelled.");
  }

  async function start() {
    if (!session) return;
    setStarting(true);
    setError("");
    const response = await fetch(`/api/sessions/${sessionId}/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: session.revision }),
    });
    const body = (await response.json()) as {
      state?: string;
      revision?: number;
      question?: LiveQuestion;
      error?: string;
    };
    if (response.ok && body.question) {
      setQuestion(body.question);
      setProgress({ answeredCount: 0, totalPlayers: players.length });
      setSession({
        ...session,
        state: body.state ?? "QUESTION_OPEN",
        revision: body.revision ?? session.revision,
      });
    } else setError(body.error ?? "The quiz could not be started.");
    setStarting(false);
  }

  async function reveal() {
    if (!session) return;
    setTransitioning(true);
    setError("");
    const response = await fetch(`/api/sessions/${sessionId}/reveal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: session.revision }),
    });
    const body = (await response.json()) as {
      state?: string;
      revision?: number;
      results?: LiveResults;
      error?: string;
    };
    if (response.ok && body.results) {
      setResults(body.results);
      setSession({
        ...session,
        state: body.state ?? "RESULTS",
        revision: body.revision ?? session.revision,
      });
    } else setError(body.error ?? "Results could not be revealed.");
    setTransitioning(false);
  }

  async function advance(action: "next" | "finish") {
    if (!session) return;
    setTransitioning(true);
    setError("");
    const response = await fetch(`/api/sessions/${sessionId}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: session.revision }),
    });
    const body = (await response.json()) as {
      state?: string;
      revision?: number;
      question?: LiveQuestion;
      leaderboard?: LeaderboardEntry[];
      error?: string;
    };
    if (response.ok) {
      setSession({
        ...session,
        state: body.state ?? session.state,
        revision: body.revision ?? session.revision,
      });
      if (action === "next" && body.question) {
        setQuestion(body.question);
        setResults(undefined);
        setProgress({ answeredCount: 0, totalPlayers: players.length });
      }
      if (action === "finish" && body.leaderboard)
        setFinalLeaderboard(body.leaderboard);
    } else setError(body.error ?? "The quiz could not advance.");
    setTransitioning(false);
  }

  if (error)
    return (
      <main className="app-shell">
        <section className="empty-state">
          <p className="error">{error}</p>
          <button onClick={onClose}>Back to quizzes</button>
        </section>
      </main>
    );
  if (!session)
    return (
      <main className="shell">
        <p>Opening lobby…</p>
      </main>
    );
  if (finalLeaderboard)
    return (
      <Podium
        entries={finalLeaderboard}
        action={<button onClick={onClose}>Back to quizzes</button>}
      />
    );
  if (results)
    return (
      <ResultsView
        results={results}
        action={
          <div className="host-result-actions">
            {results.question.position + 1 < results.question.totalQuestions ? (
              <button
                disabled={transitioning}
                onClick={() => void advance("next")}
              >
                {transitioning ? "Loading…" : "Next question"}
              </button>
            ) : (
              <button
                disabled={transitioning}
                onClick={() => void advance("finish")}
              >
                {transitioning ? "Finishing…" : "Finish quiz"}
              </button>
            )}
            <button className="danger" onClick={() => void cancel()}>
              Cancel quiz
            </button>
          </div>
        }
      />
    );
  if (question)
    return (
      <main className="question-screen">
        <header className="question-header">
          <p>
            Question {question.position + 1} of {question.totalQuestions}
          </p>
          <strong className="timer">{secondsRemaining}</strong>
          <p>{question.points} points</p>
        </header>
        <h1>{question.prompt}</h1>
        <p className="answer-progress">
          {progress.answeredCount} / {progress.totalPlayers} answered
        </p>
        <div className="answer-grid">
          {question.answers.map((answer, index) => (
            <div
              className={`answer-option answer-${index % 4}`}
              key={answer.id}
            >
              {answer.text}
            </div>
          ))}
        </div>
        <button
          className="reveal-button"
          disabled={transitioning}
          onClick={() => void reveal()}
        >
          {transitioning ? "Revealing…" : "Show results"}
        </button>
        <button className="danger cancel-live" onClick={() => void cancel()}>
          Cancel quiz
        </button>
      </main>
    );
  return (
    <main className="lobby-shell">
      <section className="lobby-main">
        <p className="eyebrow">Waiting for players</p>
        <h1>{session.quizTitle}</h1>
        <p>Scan to join</p>
        {qrCode && (
          <img
            className="qr-code"
            src={qrCode}
            alt={`QR code to join with code ${session.joinCode}`}
          />
        )}
        <p className="join-code">{session.joinCode}</p>
        <p className="join-url">
          {joinOrigin}
          {session.joinPath}
        </p>
      </section>
      <aside className="lobby-sidebar">
        <h2>Players</h2>
        <p className="player-count">{players.length}</p>
        {players.length ? (
          <ul className="player-list">
            {players.map((player) => (
              <li key={player.id}>{player.nickname}</li>
            ))}
          </ul>
        ) : (
          <p>No one has joined yet.</p>
        )}
        <button
          disabled={!players.length || starting}
          onClick={() => void start()}
        >
          {starting ? "Starting…" : "Start quiz"}
        </button>
        <button className="danger" onClick={() => void cancel()}>
          Cancel quiz
        </button>
        <button className="secondary" onClick={onClose}>
          Back to dashboard
        </button>
      </aside>
    </main>
  );
}
