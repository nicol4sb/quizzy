import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  localUuid,
  type LeaderboardEntry,
  type LiveQuestion,
  type LiveResults,
  useCountdown,
} from "./live";
import { Podium } from "./ResultsView";

type Lobby = { joinCode: string; quizTitle: string };
type JoinedPlayer = {
  sessionId: string;
  quizTitle: string;
  player: { id: string; nickname: string };
  token: string;
};
type PlayerResult = {
  answerId?: string;
  isCorrect: boolean;
  pointsAwarded: number;
};

function websocketUrl(joined: JoinedPlayer): string {
  const url = new URL("/ws", window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("sessionId", joined.sessionId);
  url.searchParams.set("role", "player");
  url.searchParams.set("token", joined.token);
  return url.toString();
}

const storedPlayerKey = (code: string) =>
  `quizzy:player:${code.trim().toUpperCase()}`;

function restorePlayer(code: string): JoinedPlayer | undefined {
  try {
    const stored = window.sessionStorage.getItem(storedPlayerKey(code));
    if (!stored) return undefined;
    const player = JSON.parse(stored) as Partial<JoinedPlayer>;
    if (
      typeof player.sessionId !== "string" ||
      typeof player.quizTitle !== "string" ||
      typeof player.token !== "string" ||
      typeof player.player?.id !== "string" ||
      typeof player.player.nickname !== "string"
    ) {
      window.sessionStorage.removeItem(storedPlayerKey(code));
      return undefined;
    }
    return player as JoinedPlayer;
  } catch {
    window.sessionStorage.removeItem(storedPlayerKey(code));
    return undefined;
  }
}

export function PlayerJoin({ code }: { code: string }) {
  const [lobby, setLobby] = useState<Lobby>();
  const [joined, setJoined] = useState<JoinedPlayer | undefined>(() =>
    restorePlayer(code),
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [question, setQuestion] = useState<LiveQuestion>();
  const [selectedAnswerId, setSelectedAnswerId] = useState<string>();
  const [answering, setAnswering] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [results, setResults] = useState<LiveResults>();
  const [playerResult, setPlayerResult] = useState<PlayerResult>();
  const [finalLeaderboard, setFinalLeaderboard] =
    useState<LeaderboardEntry[]>();
  const [cancelled, setCancelled] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState("");
  const secondsRemaining = useCountdown(question?.closesAt);
  const answerRevealRemaining = useCountdown(question?.answersAvailableAt);

  useEffect(() => {
    if (joined) {
      setLoading(false);
      return;
    }
    void fetch(`/api/lobbies/${encodeURIComponent(code)}`)
      .then(async (response) => {
        if (!response.ok)
          throw new Error("This lobby does not exist or has already started.");
        return ((await response.json()) as { lobby: Lobby }).lobby;
      })
      .then(setLobby)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not load this lobby.",
        ),
      )
      .finally(() => setLoading(false));
  }, [code, joined]);

  useEffect(() => {
    if (!joined) return;
    const activePlayer = joined;
    let socket: WebSocket | undefined;
    let retryTimer: number | undefined;
    let retryAttempt = 0;
    let stopped = false;

    async function syncSnapshot(): Promise<string | undefined> {
      let response: Response;
      try {
        response = await fetch(
          `/api/sessions/${activePlayer.sessionId}/player`,
          {
            headers: { authorization: `Bearer ${activePlayer.token}` },
          },
        );
      } catch {
        setReconnecting(true);
        return undefined;
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 404) {
          window.sessionStorage.removeItem(storedPlayerKey(code));
          setCancelled(true);
          return "ENDED";
        }
        return undefined;
      }
      const snapshot = (await response.json()) as {
        session: { state: string };
        currentQuestion?: LiveQuestion;
        submittedAnswerId?: string;
        playerResult?: PlayerResult;
        results?: LiveResults;
        leaderboard?: LeaderboardEntry[];
      };
      setQuestion(snapshot.currentQuestion);
      setSelectedAnswerId(snapshot.submittedAnswerId);
      setAnswered(Boolean(snapshot.submittedAnswerId));
      setResults(snapshot.results);
      setPlayerResult(snapshot.playerResult);
      setFinalLeaderboard(snapshot.leaderboard);
      return snapshot.session.state;
    }

    function handleMessage(message: MessageEvent) {
      const event = JSON.parse(message.data as string) as {
        type: string;
        payload?: {
          question?: LiveQuestion;
          results?: LiveResults;
          leaderboard?: LeaderboardEntry[];
        };
      };
      if (event.type === "connected") {
        retryAttempt = 0;
        setReconnecting(false);
        void syncSnapshot();
      }
      if (event.type === "question_opened" && event.payload?.question)
        setQuestion((current) => {
          if (current?.roundId !== event.payload!.question!.roundId) {
            setSelectedAnswerId(undefined);
            setAnswered(false);
            setResults(undefined);
            setPlayerResult(undefined);
          }
          return event.payload!.question;
        });
      if (event.type === "results_revealed" && event.payload?.results) {
        setResults(event.payload.results);
        void syncSnapshot();
      }
      if (event.type === "quiz_finished" && event.payload?.leaderboard) {
        setFinalLeaderboard(event.payload.leaderboard);
        stopped = true;
        socket?.close();
      }
      if (event.type === "session_ended") {
        window.sessionStorage.removeItem(storedPlayerKey(code));
        setCancelled(true);
        stopped = true;
        socket?.close();
      }
    }

    function connect() {
      if (
        stopped ||
        socket?.readyState === WebSocket.OPEN ||
        socket?.readyState === WebSocket.CONNECTING
      )
        return;
      socket = new WebSocket(websocketUrl(activePlayer));
      socket.addEventListener("message", handleMessage);
      socket.addEventListener("close", () => {
        if (stopped) return;
        setReconnecting(true);
        const delay = Math.min(1000 * 2 ** retryAttempt, 10_000);
        retryAttempt += 1;
        retryTimer = window.setTimeout(connect, delay);
      });
    }

    function resume() {
      if (document.visibilityState === "hidden" || stopped) return;
      window.clearTimeout(retryTimer);
      void syncSnapshot().then((state) => {
        if (state !== "FINISHED" && state !== "ENDED") connect();
      });
    }

    void syncSnapshot().then((state) => {
      if (state !== "FINISHED" && state !== "ENDED") connect();
    });
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      socket?.close();
    };
  }, [code, joined]);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(
      `/api/lobbies/${encodeURIComponent(code)}/players`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname: form.get("nickname") }),
      },
    );
    const body = (await response.json()) as JoinedPlayer & { error?: string };
    if (response.ok) {
      window.sessionStorage.setItem(
        storedPlayerKey(code),
        JSON.stringify(body),
      );
      setJoined(body);
    } else setError(body.error ?? "Could not join this lobby.");
    setSubmitting(false);
  }

  async function submitAnswer(answerId: string) {
    if (
      !joined ||
      !question ||
      answered ||
      answering ||
      answerRevealRemaining > 0 ||
      secondsRemaining === 0
    )
      return;
    setSelectedAnswerId(answerId);
    setAnswering(true);
    setError("");
    const response = await fetch(`/api/sessions/${joined.sessionId}/answers`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${joined.token}`,
      },
      body: JSON.stringify({
        submissionId: localUuid(),
        roundId: question.roundId,
        answerId,
      }),
    });
    const body = (await response.json()) as {
      accepted?: boolean;
      error?: string;
    };
    if (response.ok && body.accepted) setAnswered(true);
    else {
      setSelectedAnswerId(undefined);
      setError(body.error ?? "Your answer could not be submitted.");
    }
    setAnswering(false);
  }

  if (loading)
    return (
      <main className="shell">
        <p>Finding lobby…</p>
      </main>
    );

  if (joined && cancelled)
    return (
      <main className="shell">
        <section className="card">
          <p className="eyebrow">Quiz cancelled</p>
          <h1>Game over</h1>
          <p>The host cancelled this quiz.</p>
        </section>
      </main>
    );

  if (joined && finalLeaderboard) return <Podium entries={finalLeaderboard} />;

  if (joined && results) {
    const correctAnswer = results.question.answers.find(
      (answer) => answer.id === results.correctAnswerId,
    );
    return (
      <main
        className={`player-result ${playerResult?.isCorrect ? "player-result-correct" : "player-result-incorrect"}`}
      >
        {playerResult ? (
          <section className="player-result-card" aria-live="polite">
            <div className="result-symbol" aria-hidden="true">
              {playerResult.isCorrect ? "✓" : "×"}
            </div>
            <p className="eyebrow">
              {playerResult.isCorrect
                ? "Correct!"
                : playerResult.answerId
                  ? "Not this time"
                  : "Time’s up"}
            </p>
            <strong className="points-earned">
              +{playerResult.pointsAwarded} points
            </strong>
            <div className="correct-answer-card">
              <small>Correct answer</small>
              <strong>{correctAnswer?.text ?? "Answer revealed"}</strong>
            </div>
          </section>
        ) : (
          <section className="player-result-card">
            <p>Calculating your score…</p>
          </section>
        )}
      </main>
    );
  }

  if (joined && question)
    return (
      <main className="player-question">
        {reconnecting && (
          <p className="connection-notice" role="status">
            Reconnecting…
          </p>
        )}
        <header className="question-header">
          <p>
            Question {question.position + 1} of {question.totalQuestions}
          </p>
          <strong className="timer">
            {answerRevealRemaining || secondsRemaining}
          </strong>
          <p>{question.points} pts</p>
        </header>
        <div className="remote-prompt">
          <h1>
            {answerRevealRemaining > 0 ? "Get ready…" : "Choose an answer"}
          </h1>
        </div>
        {answerRevealRemaining > 0 && (
          <div className="question-preview-track" aria-hidden="true">
            <span
              style={{
                width: `${Math.min(100, (10 - answerRevealRemaining) * 10)}%`,
              }}
            />
          </div>
        )}
        <div className="answer-grid player-answers">
          {question.answers.map((answer, index) => {
            const answerLabel = String.fromCharCode(65 + index);
            const locked = answerRevealRemaining > 0;
            return (
              <button
                className={`answer-option answer-${index % 4}${locked ? " locked" : " unlocked"}${selectedAnswerId === answer.id ? " selected" : ""}`}
                key={answer.id}
                aria-label={`Answer ${answerLabel}${locked ? ", locked" : ""}`}
                disabled={
                  locked || answered || answering || secondsRemaining === 0
                }
                onClick={() => void submitAnswer(answer.id)}
              >
                <span aria-hidden="true">{answerLabel}</span>
                {locked && <small>Locked</small>}
              </button>
            );
          })}
        </div>
        {answerRevealRemaining === 0 &&
          (answered ? <p>Answer received!</p> : <p>Choose one answer.</p>)}
        {error && <p className="error">{error}</p>}
      </main>
    );

  if (joined)
    return (
      <main className="shell">
        {reconnecting && (
          <p className="connection-notice" role="status">
            Reconnecting…
          </p>
        )}
        <section className="card waiting-card">
          <p className="eyebrow">You’re in</p>
          <h1>{joined.player.nickname}</h1>
          <p>{joined.quizTitle}</p>
          <p>Look at the main screen. The host will start soon.</p>
        </section>
      </main>
    );

  return (
    <main className="shell">
      <section className="card join-card">
        <p className="eyebrow">Join quiz · {code.toUpperCase()}</p>
        <h1>{lobby?.quizTitle ?? "Lobby unavailable"}</h1>
        {lobby ? (
          <form onSubmit={(event) => void join(event)}>
            <label>
              Your nickname
              <input
                name="nickname"
                maxLength={24}
                autoComplete="nickname"
                autoFocus
                required
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button disabled={submitting}>
              {submitting ? "Joining…" : "Join quiz"}
            </button>
          </form>
        ) : (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
