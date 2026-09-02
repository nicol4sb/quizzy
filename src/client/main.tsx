import { StrictMode, useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { AnonymousQuizEditor, QuizDashboard } from "./QuizDashboard";
import { PlayerJoin } from "./PlayerJoin";
import { RichText } from "./RichText";
import { navigateInternally, navigateTo, SiteHeader } from "./SiteHeader";
import { loadAnonymousDraft } from "./quizzes";
import { trackAnalytics } from "./analytics";
import { AnalyticsDashboard } from "./AnalyticsDashboard";
import "./styles.css";

type Creator = {
  id: string;
  email: string;
  isAdmin?: boolean;
  createdAt: string;
};
type PublicQuiz = {
  id: string;
  title: string;
  theme: string;
  creator: string;
  playCount: number;
  questionCount: number;
  rank?: number;
  isMine?: boolean;
};
type PublicQuizDetail = PublicQuiz & {
  questions: {
    id: string;
    prompt: string;
    points: number;
    timeLimitSeconds: number;
    answers: { id: string; text: string; correct: boolean }[];
  }[];
};

function creatorDisplayName(email: string): string {
  const localPart = email.split("@", 1)[0] ?? email;
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

const demoSequence = {
  question: "Which function does this series evaluate?",
  source: "$$\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}$$",
  answers: [
    "Riemann zeta function",
    "The Gamma function",
    "A Fourier series coefficient",
  ],
};
const demoSlideStages = [0, 5, 6];
const studentAnswerOrder = [0, 4, 7, 2, 5, 1, 6, 3];
const studentAnswers = [1, 2, 3, 1, 2, 3, 2, 1];
const studentFigures = [
  [" .-.", "(o_o)", "/|_|\\", " / \\"],
  [" .-.", "(O_O)", "\\|_|/", " / \\"],
  [" .-.", "(^_^)", "/|\\", " _/ \\_"],
  [" .-.", "(._.)", "\\|_|", " /\\ "],
  [" .-.", "(o.O)", "/|_|\\", " / \\"],
  [" .-.", "(¬_¬)", "_|_|_", " / \\"],
  [" .-.", "(•_•)", "/|\\", " /_\\ "],
  [" .-.", "(^o^)", "\\|_|/", " / \\"],
];

function PublicActivity({
  loggedIn,
  isAdmin = false,
  email,
  onLogout,
  onLogin,
  showReelNavigation = true,
}: {
  loggedIn: boolean;
  isAdmin?: boolean;
  email?: string;
  onLogout?: () => Promise<void>;
  onLogin?: (register: boolean) => void;
  showReelNavigation?: boolean;
}) {
  return (
    <main className="public-page app-shell landing-page">
      <SiteHeader
        active="home"
        loggedIn={loggedIn}
        isAdmin={isAdmin}
        email={email}
        onLogout={onLogout}
        onLogin={onLogin}
        tagline={
          <h1 id="landing-title">
            Questions that matter.
            <br />
            <span className="site-tagline-indent">Engaged audiences.</span>
          </h1>
        }
      />
      <LandingHero
        loggedIn={loggedIn}
        showReelNavigation={showReelNavigation}
      />
    </main>
  );
}

function MostPlayedPage({
  quizzes,
  loggedIn,
  isAdmin = false,
  email,
  onLogout,
  onLogin,
  myPublicQuizzes,
}: {
  quizzes: PublicQuiz[];
  loggedIn: boolean;
  isAdmin?: boolean;
  email?: string;
  onLogout?: () => Promise<void>;
  onLogin?: (register: boolean) => void;
  myPublicQuizzes: PublicQuiz[];
}) {
  const [classError, setClassError] = useState("");
  async function launchClassQuiz(quizId: string) {
    if (!loggedIn) {
      onLogin?.(false);
      return;
    }
    setClassError("");
    const response = await fetch(`/api/quizzes/${quizId}/sessions`, {
      method: "POST",
    });
    const body = (await response.json()) as {
      session?: { id: string };
      error?: string;
    };
    if (!response.ok || !body.session) {
      setClassError(body.error ?? "Could not start a class quiz.");
      return;
    }
    trackAnalytics("live_session_created", {
      quizId,
      liveSessionId: body.session.id,
      path: "/popular",
    });
    navigateTo(`/host/${body.session.id}`);
  }
  return (
    <main className="public-page app-shell popular-page">
      <SiteHeader
        active="play"
        loggedIn={loggedIn}
        isAdmin={isAdmin}
        email={email}
        onLogout={onLogout}
        onLogin={onLogin}
      />
      <section
        className="public-activity-section"
        aria-labelledby="popular-heading"
      >
        <div className="public-activity-heading">
          <h2 id="popular-heading">Most played</h2>
          <span>Ranked by classroom plays</span>
        </div>
        {classError && (
          <p className="error" role="alert">
            {classError}
          </p>
        )}
        <PublicQuizList
          quizzes={quizzes}
          limit={6}
          myPublicQuizzes={myPublicQuizzes}
          loggedIn={loggedIn}
          onClassPlay={(quizId) => void launchClassQuiz(quizId)}
        />
      </section>
    </main>
  );
}

function SoloQuiz({
  quizId,
  loggedIn,
  isAdmin = false,
  email,
  onLogout,
  onLogin,
}: {
  quizId: string;
  loggedIn: boolean;
  isAdmin?: boolean;
  email?: string;
  onLogout?: () => Promise<void>;
  onLogin?: (register: boolean) => void;
}) {
  const [quiz, setQuiz] = useState<PublicQuizDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string>();
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [shareMessage, setShareMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const response = await fetch(`/api/public/quizzes/${quizId}`);
      if (!response.ok) {
        if (active) {
          setError("This public quiz is no longer available.");
          setLoading(false);
        }
        return;
      }
      const body = (await response.json()) as { quiz: PublicQuizDetail };
      if (!active) return;
      setQuiz(body.quiz);
      setLoading(false);
      trackAnalytics("quiz_viewed", { quizId, path: `/play/${quizId}` });
      await fetch(`/api/public/quizzes/${quizId}/play`, { method: "POST" });
      trackAnalytics("solo_started", { quizId, path: `/play/${quizId}` });
    }
    void load().catch(() => {
      if (active) {
        setError("Could not load this quiz.");
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [quizId]);

  const soloHeader = (
    <SiteHeader
      active="play"
      loggedIn={loggedIn}
      isAdmin={isAdmin}
      email={email}
      onLogout={onLogout}
      onLogin={onLogin}
    />
  );

  if (loading)
    return (
      <main className="solo-page app-shell">
        {soloHeader}
        <p>Loading quiz…</p>
      </main>
    );
  if (error || !quiz)
    return (
      <main className="solo-page app-shell">
        {soloHeader}
        <a
          className="solo-back-link"
          href="/popular"
          onClick={(event) => navigateInternally(event, "/popular")}
        >
          ← Popular quizzes
        </a>
        <p className="error" role="alert">
          {error || "Quiz not found."}
        </p>
      </main>
    );

  const loadedQuiz = quiz;
  const question = loadedQuiz.questions[questionIndex];
  if (finished || !question)
    return (
      <main className="solo-page app-shell">
        {soloHeader}
        <div className="solo-quiz-shell solo-finished">
          <a
            className="solo-back-link"
            href="/popular"
            onClick={(event) => navigateInternally(event, "/popular")}
          >
            ← Popular quizzes
          </a>
          <p className="eyebrow">Quiz complete</p>
          <h1>{loadedQuiz.title}</h1>
          <strong className="solo-score">{score} points</strong>
          <p>
            You finished all {loadedQuiz.questions.length} questions in this
            public quiz.
          </p>
          <a
            className="landing-primary-action"
            href="/popular"
            onClick={(event) => navigateInternally(event, "/popular")}
          >
            Explore more quizzes
          </a>
        </div>
      </main>
    );

  function chooseAnswer(answerId: string) {
    if (selectedAnswer) return;
    const answer = question.answers.find((item) => item.id === answerId);
    setSelectedAnswer(answerId);
    if (answer?.correct) setScore((current) => current + question.points);
  }
  function nextQuestion() {
    if (!selectedAnswer) return;
    if (questionIndex + 1 >= loadedQuiz.questions.length) setFinished(true);
    else {
      setQuestionIndex((current) => current + 1);
      setSelectedAnswer(undefined);
    }
  }
  async function shareQuiz() {
    const url = window.location.href;
    const share = navigator.share;
    if (share) {
      try {
        await share({
          title: loadedQuiz.title,
          text: "Play this Quizzy quiz",
          url,
        });
        return;
      } catch {
        // Dismissing the native share sheet is not an error.
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage("Link copied");
      window.setTimeout(() => setShareMessage(""), 2200);
    } catch {
      setShareMessage(url);
    }
  }
  return (
    <main className="solo-page app-shell">
      {soloHeader}
      <div className="solo-quiz-shell">
        <div className="solo-quiz-meta">
          <div>
            <p className="eyebrow">{creatorDisplayName(loadedQuiz.creator)}</p>
            <h1>{loadedQuiz.title}</h1>
          </div>
          <span>
            {questionIndex + 1} / {loadedQuiz.questions.length}
          </span>
          <button
            type="button"
            className="solo-share-button"
            onClick={() => void shareQuiz()}
          >
            <span aria-hidden="true">↗</span> Share
          </button>
        </div>
        <section className="solo-question-card">
          <RichText text={question.prompt} />
          <small>{question.points} points</small>
        </section>
        <div className="solo-answer-grid">
          {question.answers.map((answer, index) => {
            const chosen = selectedAnswer === answer.id;
            const revealed = Boolean(selectedAnswer);
            return (
              <button
                className={`solo-answer${
                  chosen ? (answer.correct ? " is-correct" : " is-wrong") : ""
                }${revealed && !chosen ? " is-muted" : ""}`}
                key={answer.id}
                type="button"
                onClick={() => chooseAnswer(answer.id)}
                disabled={revealed}
              >
                <b>{index + 1}</b>
                <RichText text={answer.text} />
              </button>
            );
          })}
        </div>
        {selectedAnswer && (
          <div className="solo-result" role="status">
            <strong>
              {question.answers.find((answer) => answer.id === selectedAnswer)
                ?.correct
                ? `Correct · +${question.points}`
                : "Not quite · +0"}
            </strong>
            <button className="landing-primary-action" onClick={nextQuestion}>
              {questionIndex + 1 === loadedQuiz.questions.length
                ? "See final score"
                : "Next question"}
            </button>
          </div>
        )}
        {shareMessage && (
          <p className="solo-share-message" role="status">
            {shareMessage}
          </p>
        )}
      </div>
    </main>
  );
}

function LandingHero({
  loggedIn,
  showReelNavigation,
}: {
  loggedIn: boolean;
  showReelNavigation: boolean;
}) {
  return (
    <section className="landing-hero" aria-labelledby="landing-title">
      <div
        className="landing-demo-reel"
        aria-label="Quizzy LaTeX editor and live preview demo"
      >
        <MathDemoReel loggedIn={loggedIn} showNavigation={showReelNavigation} />
      </div>
    </section>
  );
}

function MathDemoReel({
  loggedIn,
  showNavigation,
}: {
  loggedIn: boolean;
  showNavigation: boolean;
}) {
  const sequence = demoSequence;
  const fullText = sequence.question + " " + sequence.source;
  const [stage, setStage] = useState(0);
  const [runId, setRunId] = useState(0);
  const [typedLength, setTypedLength] = useState(0);
  const [answerTypedLength, setAnswerTypedLength] = useState(0);
  const [responses, setResponses] = useState(0);
  const [showResultsCta, setShowResultsCta] = useState(false);
  useEffect(() => {
    let timer: number | undefined;
    let interval: number | undefined;
    let ctaTimer: number | undefined;

    if (stage === 0) {
      const typeQuestion = (index: number) => {
        setTypedLength(index);
        if (index >= fullText.length) {
          timer = window.setTimeout(() => setStage(1), 1900);
          return;
        }
        timer = window.setTimeout(() => typeQuestion(index + 1), 82);
      };
      typeQuestion(0);
    } else if (stage === 1) {
      timer = window.setTimeout(() => {
        setAnswerTypedLength(0);
        setStage(2);
      }, 1900);
    } else if (stage >= 2 && stage <= 4) {
      const answer = sequence.answers[stage - 2];
      const typeAnswer = (index: number) => {
        setAnswerTypedLength(index);
        if (index >= answer.length) {
          const nextStageDelay = stage === 4 ? 700 : 300;
          timer = window.setTimeout(() => {
            setAnswerTypedLength(0);
            setStage(stage + 1);
          }, nextStageDelay);
          return;
        }
        timer = window.setTimeout(() => typeAnswer(index + 1), 45);
      };
      typeAnswer(0);
    } else if (stage === 5) {
      setResponses(0);
      const responseSteps = [1, 2, 4, 5, 8];
      let responseStep = 0;
      interval = window.setInterval(() => {
        setResponses(
          responseSteps[Math.min(responseStep++, responseSteps.length - 1)],
        );
      }, 900);
      timer = window.setTimeout(() => setStage(6), 8500);
    } else {
      timer = window.setTimeout(() => {
        setTypedLength(0);
        setAnswerTypedLength(0);
        setResponses(0);
        setShowResultsCta(false);
        setStage(0);
      }, 18000);
      ctaTimer = window.setTimeout(() => setShowResultsCta(true), 3000);
    }

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (interval !== undefined) window.clearInterval(interval);
      if (ctaTimer !== undefined) window.clearTimeout(ctaTimer);
    };
  }, [fullText, runId, sequence, stage]);

  const typed = fullText.slice(0, typedLength);
  const answeredCount = stage === 5 ? responses : 0;
  const currentSlide = stage <= 4 ? 0 : stage === 5 ? 1 : 2;

  const goToSlide = useCallback(
    (index: number) => {
      const target = demoSlideStages[index];
      setStage(target);
      setRunId((current) => current + 1);
      setShowResultsCta(false);
      if (target === 0) {
        setTypedLength(0);
        setAnswerTypedLength(0);
        setResponses(0);
      } else if (target === 5) {
        setAnswerTypedLength(sequence.answers[2].length);
        setResponses(0);
      } else {
        setAnswerTypedLength(sequence.answers[2].length);
        setResponses(0);
      }
    },
    [sequence],
  );

  useEffect(() => {
    function handleArrow(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      goToSlide(
        (currentSlide + direction + demoSlideStages.length) %
          demoSlideStages.length,
      );
    }
    window.addEventListener("keydown", handleArrow);
    return () => window.removeEventListener("keydown", handleArrow);
  }, [currentSlide, goToSlide]);

  return (
    <div
      className={`demo-fullscreen-reel demo-reel-phase-${stage}${
        showResultsCta ? " has-results-cta" : ""
      }`}
      aria-label="Interactive Quizzy demo. Use the arrow keys or slide dots to navigate."
    >
      <section
        className="demo-reel-screen demo-reel-quiz-screen"
        key="quiz-math"
      >
        {stage === 5 ? (
          <>
            <div className="demo-classroom-scene">
              <small className="demo-reel-stage-label demo-reel-play-label">
                Play
              </small>
              <div
                className="demo-projector"
                aria-label="Projected quiz question"
              >
                <div className="demo-projector-wall">
                  <div className="demo-projector-screen">
                    <div className="demo-projector-question">
                      <p>{sequence.question}</p>
                      <RichText text={sequence.source} />
                    </div>
                    <div className="demo-projector-answers">
                      {sequence.answers.map((answer, index) => (
                        <div key={answer}>
                          <b>{index + 1}</b>
                          <RichText text={answer} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="demo-projector-stand" aria-hidden="true" />
                </div>
              </div>
              <div
                className="demo-student-area"
                aria-label="Classroom responses"
              >
                <div className="demo-students" aria-label="Students answering">
                  {Array.from({ length: 8 }, (_, index) => {
                    const hasAnswered =
                      answeredCount >= studentAnswerOrder.indexOf(index) + 1;
                    return (
                      <div
                        className={`demo-student${hasAnswered ? " is-answered" : ""}`}
                        aria-label={`Student ${index + 1}${hasAnswered ? ` answered option ${studentAnswers[index]}` : " is thinking"}`}
                        key={index}
                      >
                        <span className="demo-student-ascii" aria-hidden="true">
                          {studentFigures[index].join("\n")}
                        </span>
                        <span className="demo-student-phone" aria-hidden="true">
                          {hasAnswered ? studentAnswers[index] : "▯"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div
                className="demo-classroom-progress"
                aria-label={`${answeredCount} of 8 responses received`}
              >
                <div
                  className="demo-classroom-progress-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={8}
                  aria-valuenow={answeredCount}
                >
                  <span style={{ width: `${(answeredCount / 8) * 100}%` }} />
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <small className="demo-reel-stage-label">Create your quiz</small>
            <div
              className={`demo-reel-question-card${stage === 0 ? " is-creating" : ""}`}
            >
              {stage === 0 ? (
                <>
                  <div className="demo-typing-surface" aria-live="polite">
                    <span>{typed}</span>
                    <span className="demo-caret" aria-hidden="true" />
                  </div>
                </>
              ) : (
                <>
                  <small>Rendered question</small>
                  <p>{sequence.question}</p>
                  <RichText text={sequence.source} />
                </>
              )}
            </div>
            <div
              className="demo-reel-answer-list"
              aria-label="Possible answers"
            >
              {sequence.answers.map((answer, index) => {
                const isActive = stage === index + 2;
                const isComplete =
                  stage > index + 2 ||
                  (stage === index + 2 && answerTypedLength >= answer.length);
                const answerText =
                  isActive && answerTypedLength < answer.length
                    ? answer.slice(0, answerTypedLength)
                    : stage >= index + 2
                      ? answer
                      : "";
                return (
                  <div className="demo-reel-answer" key={answer}>
                    <b>{index + 1}</b>
                    <span>{answerText}</span>
                    {isActive && !isComplete && (
                      <i className="demo-caret" aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="demo-reel-screen demo-reel-results-screen">
        <small className="demo-reel-stage-label">Engage</small>
        <div className="demo-fireworks" aria-hidden="true">
          <span className="demo-firework demo-firework-left" />
          <span className="demo-firework demo-firework-right" />
          <span className="demo-firework demo-firework-top" />
          <span className="demo-firework demo-firework-mid-left" />
          <span className="demo-firework demo-firework-mid-right" />
          <span className="demo-firework demo-firework-bottom" />
          <span className="demo-firework demo-firework-high-left" />
          <span className="demo-firework demo-firework-high-right" />
        </div>
        <div className="demo-podium" aria-label="Quiz results podium">
          <span className="demo-podium-second">
            <em className="demo-podium-student" aria-hidden="true">
              {" .-.\n(o_o)\n/|_|\\\n / \\"}
            </em>
            <b className="demo-podium-score">780 pts</b>
            <i>Alex</i>
          </span>
          <span className="demo-podium-first">
            <em className="demo-podium-student" aria-hidden="true">
              {" .-.\n(^o^)\n\\|_|/\n / \\"}
            </em>
            <b className="demo-podium-score">920 pts</b>
            <i>Maya</i>
          </span>
          <span className="demo-podium-third">
            <em className="demo-podium-student" aria-hidden="true">
              {" .-.\n(•_•)\n/|\\\n /_\\ "}
            </em>
            <b className="demo-podium-score">640 pts</b>
            <i>Sam</i>
          </span>
        </div>
        {showResultsCta && (
          <div className="demo-results-cta-overlay">
            <strong>Make every question a moment.</strong>
            {loggedIn ? (
              <a
                className="landing-reel-action"
                href="/dashboard?new=1"
                onClick={(event) =>
                  navigateInternally(event, "/dashboard?new=1")
                }
              >
                Create your first quiz
              </a>
            ) : (
              <button
                className="landing-reel-action"
                onClick={() => navigateTo("/create")}
              >
                Create your first quiz
              </button>
            )}
          </div>
        )}
      </section>

      {showNavigation && (
        <nav className="demo-reel-dots" aria-label="Demo slides">
          {demoSlideStages.map((_, index) => (
            <button
              className={currentSlide === index ? "is-active" : ""}
              key={index}
              type="button"
              aria-label={`${index + 1} of ${demoSlideStages.length}${
                currentSlide === index ? " (current)" : ""
              }`}
              aria-pressed={currentSlide === index}
              title="Restart this slide"
              onClick={() => goToSlide(index)}
            />
          ))}
        </nav>
      )}
    </div>
  );
}

function PublicQuizList({
  quizzes,
  limit = 6,
  loggedIn = false,
  myPublicQuizzes = [],
  onClassPlay,
}: {
  quizzes: PublicQuiz[];
  limit?: number;
  loggedIn?: boolean;
  myPublicQuizzes?: PublicQuiz[];
  onClassPlay?: (quizId: string) => void;
}) {
  const [copiedQuizId, setCopiedQuizId] = useState<string>();
  const ownQuizById = new Map(
    myPublicQuizzes.map((quiz) => [quiz.id, quiz] as const),
  );
  const rankedQuizzes = [...quizzes]
    .sort((first, second) => second.playCount - first.playCount)
    .slice(0, limit)
    .map((quiz) => {
      const ownQuiz = ownQuizById.get(quiz.id);
      return ownQuiz
        ? { ...quiz, isMine: true, rank: ownQuiz.rank ?? quiz.rank }
        : quiz;
    });
  const visibleIds = new Set(rankedQuizzes.map((quiz) => quiz.id));
  const ownQuizzesOutsideRanking = myPublicQuizzes
    .filter((quiz) => !visibleIds.has(quiz.id))
    .slice(0, 3)
    .map((quiz) => ({ ...quiz, isMine: true }));
  const displayQuizzes = [...rankedQuizzes, ...ownQuizzesOutsideRanking];
  async function copyQuizLink(quizId: string) {
    try {
      await navigator.clipboard.writeText(
        new URL(`/play/${quizId}`, window.location.origin).toString(),
      );
      setCopiedQuizId(quizId);
      window.setTimeout(() => {
        setCopiedQuizId((current) =>
          current === quizId ? undefined : current,
        );
      }, 2200);
    } catch {
      setCopiedQuizId(undefined);
    }
  }
  return displayQuizzes.length ? (
    <div className="public-activity-list">
      {displayQuizzes.map((quiz, index) => (
        <article
          className={`public-activity-card${quiz.isMine ? " is-mine" : ""}`}
          key={quiz.id}
          role="link"
          tabIndex={0}
          onClick={() => navigateTo(`/play/${quiz.id}`)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            navigateTo(`/play/${quiz.id}`);
          }}
          aria-label={`Play ${quiz.title} solo`}
        >
          <span
            className="public-ranking"
            aria-label={`Rank ${quiz.rank ?? index + 1}`}
          >
            <span className="public-ranking-number">
              {quiz.rank ?? index + 1}
            </span>
            <small>Rank</small>
          </span>
          <span className="public-activity-card-main">
            <strong>{quiz.title}</strong>
            <small>
              {quiz.isMine
                ? "Your public quiz"
                : `by ${creatorDisplayName(quiz.creator)}`}{" "}
              · {quiz.questionCount} questions
            </small>
          </span>
          <span
            className="public-play-count"
            aria-label={`${quiz.playCount} plays`}
          >
            <strong>{quiz.playCount}</strong>
            <small>plays</small>
          </span>
          <span className="public-activity-card-actions">
            <button
              type="button"
              className="public-activity-card-action public-activity-card-share"
              aria-label={
                copiedQuizId === quiz.id ? "Quiz link copied" : "Copy quiz link"
              }
              title={
                copiedQuizId === quiz.id
                  ? "Quiz link copied"
                  : "Copy a link to this quiz"
              }
              onClick={(event) => {
                event.stopPropagation();
                void copyQuizLink(quiz.id);
              }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <span aria-hidden="true">
                {copiedQuizId === quiz.id ? "✓" : "⧉"}
              </span>
              {copiedQuizId === quiz.id ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              className="public-activity-card-action public-activity-card-class"
              aria-label="Launch a live session for this quiz"
              title={
                loggedIn
                  ? "Open a live room for this quiz"
                  : "Log in to host this quiz as a class"
              }
              onClick={(event) => {
                event.stopPropagation();
                onClassPlay?.(quiz.id);
              }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              Launch session
            </button>
          </span>
        </article>
      ))}
    </div>
  ) : (
    <p className="public-activity-empty">No public quizzes yet.</p>
  );
}

function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [creator, setCreator] = useState<Creator>();
  const [loginOpen, setLoginOpen] = useState(() =>
    window.location.pathname.startsWith("/login"),
  );
  const [mode, setMode] = useState<"register" | "login">(() =>
    new URLSearchParams(window.location.search).get("mode") === "register"
      ? "register"
      : "login",
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [publicQuizzes, setPublicQuizzes] = useState<PublicQuiz[]>([]);
  const [myPublicQuizzes, setMyPublicQuizzes] = useState<PublicQuiz[]>([]);

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
  useEffect(() => {
    void fetch("/api/public/quizzes")
      .then((response) =>
        response.ok ? response.json() : { quizzes: [], myPublicQuizzes: [] },
      )
      .then(
        (body: { quizzes: PublicQuiz[]; myPublicQuizzes?: PublicQuiz[] }) => {
          setPublicQuizzes(body.quizzes);
          setMyPublicQuizzes(
            (body.myPublicQuizzes ?? []).map((quiz) => ({
              ...quiz,
              isMine: true,
            })),
          );
        },
      )
      .catch(() => undefined);
  }, [creator?.id]);
  useEffect(() => {
    function syncRoute() {
      setPathname(window.location.pathname);
      setLoginOpen(window.location.pathname.startsWith("/login"));
      setMode(
        new URLSearchParams(window.location.search).get("mode") === "register"
          ? "register"
          : "login",
      );
    }
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);
  useEffect(() => {
    trackAnalytics("page_view", { path: pathname });
  }, [pathname]);

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
    if (response.ok && body.creator) {
      const destination = loadAnonymousDraft()
        ? "/dashboard?new=1"
        : "/dashboard";
      navigateTo(destination, { replace: true });
      setPathname("/dashboard");
      setLoginOpen(false);
      setCreator(body.creator);
    } else setError(body.error ?? "Something went wrong.");
    setSubmitting(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    navigateTo("/", { replace: true });
    setPathname("/");
    setCreator(undefined);
    setLoginOpen(false);
    setMode("login");
  }

  function openLogin(register: boolean) {
    setMode(register ? "register" : "login");
    setShowPassword(false);
    setError("");
    navigateTo(register ? "/login?mode=register" : "/login");
    setPathname("/login");
    setLoginOpen(true);
  }
  function closeLogin() {
    navigateTo("/");
    setPathname("/");
    setLoginOpen(false);
    setShowPassword(false);
    setError("");
  }
  useEffect(() => {
    if (!loginOpen) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLogin();
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [loginOpen]);

  if (loading)
    return (
      <main className="shell">
        <p>Loading Quizzy…</p>
      </main>
    );

  const publicPath = ["/", "/public", "/public/"].includes(pathname);
  const popularPath = ["/popular", "/popular/"].includes(pathname);
  const analyticsPath = ["/analytics", "/analytics/"].includes(pathname);
  const anonymousCreatePath = ["/create", "/create/"].includes(pathname);
  const soloQuizId = pathname.match(/^\/play\/([0-9a-f-]+)$/i)?.[1];
  if (soloQuizId && !loginOpen)
    return (
      <SoloQuiz
        quizId={soloQuizId}
        loggedIn={Boolean(creator)}
        isAdmin={Boolean(creator?.isAdmin)}
        email={creator?.email}
        onLogout={logout}
        onLogin={openLogin}
      />
    );
  if (popularPath && !loginOpen)
    return (
      <MostPlayedPage
        quizzes={publicQuizzes}
        myPublicQuizzes={myPublicQuizzes}
        loggedIn={Boolean(creator)}
        isAdmin={Boolean(creator?.isAdmin)}
        email={creator?.email}
        onLogout={logout}
        onLogin={openLogin}
      />
    );
  if (publicPath && !loginOpen && !creator)
    return (
      <PublicActivity loggedIn={false} onLogout={logout} onLogin={openLogin} />
    );

  if (anonymousCreatePath && !loginOpen)
    return <AnonymousQuizEditor onLogin={openLogin} />;

  if (creator) {
    if (analyticsPath && creator.isAdmin)
      return <AnalyticsDashboard email={creator.email} onLogout={logout} />;
    return (
      <QuizDashboard
        email={creator.email}
        isAdmin={creator.isAdmin}
        onLogout={logout}
      />
    );
  }

  if (!loginOpen)
    return <PublicActivity loggedIn={false} onLogin={openLogin} />;

  return (
    <>
      <PublicActivity
        loggedIn={false}
        onLogin={openLogin}
        showReelNavigation={false}
      />
      <div
        className="auth-modal-backdrop"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeLogin();
        }}
      >
        <section
          className="card auth-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-title"
        >
          <button
            type="button"
            className="auth-modal-close"
            aria-label="Close login"
            title="Close login"
            onClick={closeLogin}
          >
            ×
          </button>
          <p className="eyebrow">Live quizzes, together</p>
          <h1 id="auth-title">
            {mode === "register" ? "Create your account" : "Welcome back"}
          </h1>
          <p>
            {mode === "register"
              ? "Create your creator account."
              : "Welcome back."}
          </p>
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
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
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
          <p className="auth-mode-switch">
            {mode === "register"
              ? "Already have an account?"
              : "New to Quizzy?"}{" "}
            <button
              type="button"
              className="auth-mode-link"
              onClick={() => {
                setMode((current) =>
                  current === "register" ? "login" : "register",
                );
                setShowPassword(false);
                setError("");
              }}
            >
              {mode === "register" ? "Log in" : "Create an account"}
            </button>
          </p>
        </section>
      </div>
    </>
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
