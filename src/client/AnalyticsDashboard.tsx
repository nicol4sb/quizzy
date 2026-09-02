import { useEffect, useState } from "react";
import { SiteHeader } from "./SiteHeader";

type AnalyticsData = {
  days: number;
  overview: {
    uniqueVisitors: number;
    pageViews: number;
    quizViews: number;
    soloStarts: number;
    liveSessions: number;
    playersJoined: number;
    answersSubmitted: number;
    creatorAttempts: number;
  };
  daily: { day: string; visits: number; events: number }[];
  paths: { path: string; views: number }[];
  eventTypes: { eventType: string; count: number }[];
  quizzes: {
    id: string;
    title: string;
    playCount: number;
    views: number;
    soloStarts: number;
    liveSessions: number;
    answers: number;
  }[];
  recent: {
    eventType: string;
    path: string | null;
    occurredAt: string;
    quizTitle: string | null;
  }[];
};

type Props = { email: string; onLogout: () => Promise<void> };

const labels: [keyof AnalyticsData["overview"], string][] = [
  ["uniqueVisitors", "Unique visitors"],
  ["pageViews", "Page views"],
  ["quizViews", "Quiz views"],
  ["soloStarts", "Solo starts"],
  ["liveSessions", "Live sessions"],
  ["playersJoined", "Players joined"],
  ["answersSubmitted", "Answers submitted"],
  ["creatorAttempts", "Creator activity"],
];

function readableEvent(eventType: string): string {
  return eventType.replaceAll("_", " ");
}

export function AnalyticsDashboard({ email, onLogout }: Props) {
  const [data, setData] = useState<AnalyticsData>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/admin/analytics?days=30")
      .then(async (response) => {
        if (!response.ok) throw new Error("Analytics are unavailable.");
        return (await response.json()) as AnalyticsData;
      })
      .then((next) => {
        if (active) setData(next);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load analytics.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="app-shell analytics-page">
      <SiteHeader
        active="analytics"
        loggedIn
        isAdmin
        email={email}
        onLogout={onLogout}
      />
      <div className="analytics-heading">
        <div>
          <p className="eyebrow">Private admin view</p>
          <h1>Analytics</h1>
        </div>
        <span>Last {data?.days ?? 30} days</span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <p>Loading analytics…</p>
      ) : (
        <>
          <section
            className="analytics-stat-grid"
            aria-label="Traffic overview"
          >
            {labels.map(([key, label]) => (
              <article className="analytics-stat" key={key}>
                <strong>{data.overview[key].toLocaleString()}</strong>
                <span>{label}</span>
              </article>
            ))}
          </section>
          <section className="analytics-grid">
            <article className="analytics-panel analytics-traffic-panel">
              <div className="analytics-panel-heading">
                <h2>Traffic by day</h2>
                <span>Page views</span>
              </div>
              {data.daily.length ? (
                <div className="analytics-bars" aria-label="Daily page views">
                  {data.daily.map((day) => {
                    const peak = Math.max(
                      ...data.daily.map((item) => item.visits),
                      1,
                    );
                    return (
                      <div className="analytics-bar-item" key={day.day}>
                        <span
                          className="analytics-bar"
                          style={{
                            height: `${Math.max((day.visits / peak) * 100, 4)}%`,
                          }}
                          title={`${day.visits} page views on ${day.day}`}
                        />
                        <small>{day.day.slice(5)}</small>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="analytics-empty">No traffic recorded yet.</p>
              )}
            </article>
            <article className="analytics-panel">
              <div className="analytics-panel-heading">
                <h2>Popular paths</h2>
                <span>Where people go</span>
              </div>
              <div className="analytics-list">
                {data.paths.map((item) => (
                  <div className="analytics-list-row" key={item.path}>
                    <span>{item.path}</span>
                    <strong>{item.views.toLocaleString()}</strong>
                  </div>
                ))}
              </div>
            </article>
            <article className="analytics-panel analytics-quiz-panel">
              <div className="analytics-panel-heading">
                <h2>Quiz engagement</h2>
                <span>Views and starts</span>
              </div>
              <div className="analytics-list">
                {data.quizzes.length ? (
                  data.quizzes.map((quiz) => (
                    <div className="analytics-quiz-row" key={quiz.id}>
                      <strong title={quiz.title}>{quiz.title}</strong>
                      <span>
                        {quiz.views} views · {quiz.soloStarts} solo ·{" "}
                        {quiz.liveSessions} live
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="analytics-empty">No quiz activity yet.</p>
                )}
              </div>
            </article>
            <article className="analytics-panel">
              <div className="analytics-panel-heading">
                <h2>Event mix</h2>
                <span>Product activity</span>
              </div>
              <div className="analytics-list">
                {data.eventTypes.map((item) => (
                  <div className="analytics-list-row" key={item.eventType}>
                    <span>{readableEvent(item.eventType)}</span>
                    <strong>{item.count.toLocaleString()}</strong>
                  </div>
                ))}
              </div>
            </article>
          </section>
          <section className="analytics-panel analytics-recent-panel">
            <div className="analytics-panel-heading">
              <h2>Recent activity</h2>
              <span>Most recent events</span>
            </div>
            <div className="analytics-recent-list">
              {data.recent.map((item, index) => (
                <div
                  className="analytics-recent-row"
                  key={`${item.occurredAt}-${index}`}
                >
                  <strong>{readableEvent(item.eventType)}</strong>
                  <span>{item.quizTitle ?? item.path ?? "Quizzy"}</span>
                  <time dateTime={item.occurredAt}>
                    {new Date(item.occurredAt).toLocaleString()}
                  </time>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
