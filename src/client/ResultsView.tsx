import type { ReactNode } from "react";
import type { LeaderboardEntry, LiveResults } from "./live";

export function ResultsView({
  results,
  selectedAnswerId,
  action,
}: {
  results: LiveResults;
  selectedAnswerId?: string;
  action?: ReactNode;
}) {
  const votes = new Map(
    results.voteTotals.map((vote) => [vote.answerId, vote.count]),
  );
  return (
    <main className="results-screen">
      <section className="results-main">
        <p className="eyebrow">Results</p>
        <h1>{results.question.prompt}</h1>
        <div className="answer-grid">
          {results.question.answers.map((answer, index) => (
            <div
              className={`answer-option answer-${index % 4} ${
                answer.id === results.correctAnswerId ? "correct" : "incorrect"
              } ${answer.id === selectedAnswerId ? "selected" : ""}`}
              key={answer.id}
            >
              <span>{answer.text}</span>
              <strong>{votes.get(answer.id) ?? 0}</strong>
            </div>
          ))}
        </div>
      </section>
      <aside className="leaderboard-panel">
        <h2>Top players</h2>
        <Leaderboard entries={results.leaderboard} />
        {action}
      </aside>
    </main>
  );
}

export function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <ol className="leaderboard-list">
      {entries.map((entry) => (
        <li key={entry.playerId}>
          <span>#{entry.rank}</span>
          <strong>{entry.nickname}</strong>
          <span>{entry.score}</span>
        </li>
      ))}
    </ol>
  );
}

export function Podium({
  entries,
  action,
}: {
  entries: LeaderboardEntry[];
  action?: ReactNode;
}) {
  const podiumOrder = [entries[1], entries[0], entries[2]].filter(
    (entry): entry is LeaderboardEntry => Boolean(entry),
  );
  return (
    <main className="podium-screen">
      <div className="confetti" aria-hidden="true">
        ✦ · ★ · ✧ · ★ · ✦
      </div>
      <p className="eyebrow">Final results</p>
      <h1>Quiz complete!</h1>
      <section className="podium">
        {podiumOrder.map((entry) => (
          <article
            className={`podium-place place-${entry.rank}`}
            key={entry.playerId}
          >
            <span>#{entry.rank}</span>
            <strong>{entry.nickname}</strong>
            <small>{entry.score} points</small>
          </article>
        ))}
      </section>
      <Leaderboard entries={entries} />
      {action}
    </main>
  );
}
