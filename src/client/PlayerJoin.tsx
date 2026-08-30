import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  localUuid,
  type LeaderboardEntry,
  type LiveQuestion,
  type LiveResults,
  useCountdown,
} from "./live";
import { Podium, ResultsView } from "./ResultsView";

type Lobby = { joinCode: string; quizTitle: string };
type JoinedPlayer = {
  sessionId: string;
  quizTitle: string;
  player: { id: string; nickname: string };
  token: string;
};

function websocketUrl(joined: JoinedPlayer): string {
  const url = new URL("/ws", window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("sessionId", joined.sessionId);
  url.searchParams.set("role", "player");
  url.searchParams.set("token", joined.token);
  return url.toString();
}

export function PlayerJoin({ code }: { code: string }) {
  const [lobby, setLobby] = useState<Lobby>();
  const [joined, setJoined] = useState<JoinedPlayer>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [question, setQuestion] = useState<LiveQuestion>();
  const [selectedAnswerId, setSelectedAnswerId] = useState<string>();
  const [answering, setAnswering] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [results, setResults] = useState<LiveResults>();
  const [finalLeaderboard, setFinalLeaderboard] =
    useState<LeaderboardEntry[]>();
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState("");
  const secondsRemaining = useCountdown(question?.closesAt);

  useEffect(() => {
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
  }, [code]);

  useEffect(() => {
    if (!joined) return;
    const socket = new WebSocket(websocketUrl(joined));
    socket.addEventListener("message", (message) => {
      const event = JSON.parse(message.data as string) as {
        type: string;
        payload?: {
          question?: LiveQuestion;
          results?: LiveResults;
          leaderboard?: LeaderboardEntry[];
        };
      };
      if (event.type === "connected") {
        void fetch(`/api/sessions/${joined.sessionId}/player`, {
          headers: { authorization: `Bearer ${joined.token}` },
        }).then(async (response) => {
          if (!response.ok) return;
          const snapshot = (await response.json()) as {
            currentQuestion?: LiveQuestion;
            results?: LiveResults;
            leaderboard?: LeaderboardEntry[];
          };
          setQuestion(snapshot.currentQuestion);
          setResults(snapshot.results);
          setFinalLeaderboard(snapshot.leaderboard);
        });
      }
      if (event.type === "question_opened" && event.payload?.question)
        setQuestion((current) => {
          if (current?.roundId !== event.payload!.question!.roundId) {
            setSelectedAnswerId(undefined);
            setAnswered(false);
            setResults(undefined);
          }
          return event.payload!.question;
        });
      if (event.type === "results_revealed" && event.payload?.results)
        setResults(event.payload.results);
      if (event.type === "quiz_finished" && event.payload?.leaderboard)
        setFinalLeaderboard(event.payload.leaderboard);
      if (event.type === "session_ended") setCancelled(true);
    });
    return () => socket.close();
  }, [joined]);

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
    if (response.ok) setJoined(body);
    else setError(body.error ?? "Could not join this lobby.");
    setSubmitting(false);
  }

  async function submitAnswer(answerId: string) {
    if (!joined || !question || answered || answering || secondsRemaining === 0)
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

  if (joined && results)
    return (
      <ResultsView results={results} selectedAnswerId={selectedAnswerId} />
    );

  if (joined && question)
    return (
      <main className="player-question">
        <header className="question-header">
          <p>
            Question {question.position + 1} of {question.totalQuestions}
          </p>
          <strong className="timer">{secondsRemaining}</strong>
          <p>{question.points} pts</p>
        </header>
        <h1>{question.prompt}</h1>
        <div className="answer-grid player-answers">
          {question.answers.map((answer, index) => (
            <button
              className={`answer-option answer-${index % 4}${selectedAnswerId === answer.id ? " selected" : ""}`}
              key={answer.id}
              disabled={answered || answering || secondsRemaining === 0}
              onClick={() => void submitAnswer(answer.id)}
            >
              {answer.text}
            </button>
          ))}
        </div>
        {answered ? <p>Answer received!</p> : <p>Choose one answer.</p>}
        {error && <p className="error">{error}</p>}
      </main>
    );

  if (joined)
    return (
      <main className="shell">
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
