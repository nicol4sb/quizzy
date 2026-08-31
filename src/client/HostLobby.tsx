import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AnswerProgress,
  type LeaderboardEntry,
  type LiveQuestion,
  type LiveResults,
  useCountdown,
} from "./live";
import { Podium, ResultsView } from "./ResultsView";
import { RichText } from "./RichText";
import { navigateTo } from "./SiteHeader";

type Session = {
  id: string;
  quizTitle: string;
  quizTheme: "game-show" | "classroom" | "neon-arcade" | "minimal";
  joinCode: string;
  joinPath: string;
  state: string;
  revision: number;
};
type Player = { id: string; nickname: string; joinedAt: string };
type Props = { sessionId: string; onClose: () => void };

const joinSymbols: Record<Session["quizTheme"], string> = {
  "game-show": "★",
  classroom: "✎",
  "neon-arcade": "⚡",
  minimal: "+",
};

export function HostLobby({ sessionId, onClose }: Props) {
  const [session, setSession] = useState<Session>();
  const [qrCode, setQrCode] = useState("");
  const [joinOrigin, setJoinOrigin] = useState(window.location.origin);
  const [players, setPlayers] = useState<Player[]>([]);
  const [joinCelebrations, setJoinCelebrations] = useState<
    {
      player: Player;
      sequence: number;
    }[]
  >([]);
  const knownPlayerIds = useRef(new Set<string>());
  const joinSequence = useRef(0);
  const celebrationTimers = useRef(new Map<number, number>());
  const [question, setQuestion] = useState<LiveQuestion>();
  const [progress, setProgress] = useState<AnswerProgress>({
    answeredCount: 0,
    totalPlayers: 0,
  });
  const [starting, setStarting] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [results, setResults] = useState<LiveResults>();
  const [finalLeaderboard, setFinalLeaderboard] =
    useState<LeaderboardEntry[]>();
  const [error, setError] = useState("");
  const secondsRemaining = useCountdown(question?.closesAt);
  const answerRevealRemaining = useCountdown(question?.answersAvailableAt);

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
      knownPlayerIds.current = new Set(
        snapshot.players.map((player) => player.id),
      );
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
        const newPlayer = payload.players.find(
          (player) => !knownPlayerIds.current.has(player.id),
        );
        knownPlayerIds.current = new Set(
          payload.players.map((player) => player.id),
        );
        if (newPlayer) {
          joinSequence.current += 1;
          const sequence = joinSequence.current;
          setJoinCelebrations((current) =>
            [{ player: newPlayer, sequence }, ...current].slice(0, 4),
          );
          const timer = window.setTimeout(() => {
            setJoinCelebrations((current) =>
              current.filter((item) => item.sequence !== sequence),
            );
            celebrationTimers.current.delete(sequence);
          }, 8000);
          celebrationTimers.current.set(sequence, timer);
        }
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
    return () => {
      socket.close();
      for (const timer of celebrationTimers.current.values())
        window.clearTimeout(timer);
      celebrationTimers.current.clear();
    };
  }, [sessionId]);

  const cancel = useCallback(async () => {
    setCancelling(true);
    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: "DELETE",
    });
    if (response.ok) onClose();
    else {
      setCancelling(false);
      setError("The quiz could not be cancelled.");
    }
  }, [onClose, sessionId]);

  useEffect(() => {
    function leave() {
      if (!session) return;
      if (finalLeaderboard || session.state === "FINISHED") {
        onClose();
        return;
      }
      void cancel();
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !cancelling) {
        event.preventDefault();
        leave();
      }
    }
    function handleBack() {
      navigateTo(`/host/${sessionId}`, { replace: true, notify: false });
      if (!cancelling) leave();
    }
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("popstate", handleBack);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("popstate", handleBack);
    };
  }, [cancel, cancelling, finalLeaderboard, onClose, session, sessionId]);

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
            <button
              className="secondary"
              disabled={cancelling}
              onClick={() => void cancel()}
            >
              {cancelling ? "Ending…" : "← Back to dashboard"}
            </button>
          </div>
        }
      />
    );
  if (question)
    return (
      <main
        className={`question-screen ${answerRevealRemaining > 0 ? "question-preview" : "answers-visible"} answer-count-${question.answers.length}`}
      >
        <header className="question-header">
          <p>
            Question {question.position + 1} of {question.totalQuestions}
          </p>
          <span aria-hidden="true" />
          <p>{question.points} points</p>
        </header>
        <div
          aria-level={1}
          className={`question-prompt${question.prompt.length > 100 ? " long-question" : ""}`}
          role="heading"
        >
          <RichText text={question.prompt} />
        </div>
        {answerRevealRemaining > 0 ? (
          <section className="question-preview-progress">
            <div
              className="question-preview-track"
              role="progressbar"
              aria-label="Question preview"
              aria-valuemin={0}
              aria-valuemax={10}
              aria-valuenow={10 - answerRevealRemaining}
            >
              <span
                style={{
                  width: `${Math.min(100, (10 - answerRevealRemaining) * 10)}%`,
                }}
              />
            </div>
          </section>
        ) : (
          <>
            <section className="presenter-status" aria-live="polite">
              <div
                className={`round-timer-progress${secondsRemaining <= 5 ? " urgent" : ""}`}
              >
                <div className="round-timer-copy">
                  <span>Time remaining</span>
                </div>
                <div
                  className="round-timer-track"
                  role="progressbar"
                  aria-label="Answer time remaining"
                  aria-valuemin={0}
                  aria-valuemax={question.timeLimitSeconds}
                  aria-valuenow={secondsRemaining}
                >
                  <span
                    style={{
                      width: `${Math.min(100, (secondsRemaining / question.timeLimitSeconds) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="answer-progress">
                <div className="answer-progress-copy">
                  <strong>{progress.answeredCount} answered</strong>
                  <span>{progress.totalPlayers} players</span>
                </div>
                <div
                  className="answer-progress-track"
                  role="progressbar"
                  aria-label="Players who have answered"
                  aria-valuemin={0}
                  aria-valuemax={progress.totalPlayers}
                  aria-valuenow={progress.answeredCount}
                >
                  <span
                    style={{
                      width: `${progress.totalPlayers ? (progress.answeredCount / progress.totalPlayers) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </section>
            <div className="answer-grid">
              {question.answers.map((answer, index) => (
                <div
                  className={`answer-option answer-${index % 4}${answer.text.length > 70 ? " long-answer" : ""}`}
                  key={answer.id}
                >
                  <RichText text={answer.text} />
                </div>
              ))}
            </div>
          </>
        )}
        <div className="presenter-controls">
          <button
            className="reveal-button"
            disabled={transitioning || answerRevealRemaining > 0}
            onClick={() => void reveal()}
          >
            {transitioning ? "Revealing…" : "Show results"}
          </button>
          <button
            className="secondary"
            disabled={cancelling}
            onClick={() => void cancel()}
          >
            {cancelling ? "Ending…" : "← Back to dashboard"}
          </button>
        </div>
      </main>
    );
  return (
    <main className={`lobby-shell theme-${session.quizTheme}`}>
      {joinCelebrations.length > 0 && (
        <div className="join-celebrations" aria-live="polite">
          {joinCelebrations.map((joined) => (
            <div
              className="join-celebration"
              key={joined.sequence}
              role="status"
            >
              <span aria-hidden="true">{joinSymbols[session.quizTheme]}</span>
              <strong>{joined.player.nickname}</strong>
              <small>joined the quiz!</small>
            </div>
          ))}
        </div>
      )}
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
        <button
          className="secondary"
          disabled={cancelling}
          onClick={() => void cancel()}
        >
          {cancelling ? "Ending…" : "← Back to dashboard"}
        </button>
      </aside>
    </main>
  );
}
