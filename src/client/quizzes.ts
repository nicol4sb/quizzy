export type Theme = "game-show" | "classroom" | "neon-arcade" | "minimal";
export type AnswerDraft = { clientId: string; text: string; correct: boolean };
export type QuestionDraft = {
  clientId: string;
  prompt: string;
  points: number;
  timeLimitSeconds: number;
  answers: AnswerDraft[];
};
export type QuizDraft = {
  id?: string;
  title: string;
  theme: Theme;
  isPublic: boolean;
  questions: QuestionDraft[];
};
export type QuizSummary = {
  id: string;
  title: string;
  theme: Theme;
  questionCount: number;
  updatedAt: string;
  activeSessionId: string | null;
  isPublic?: boolean;
  playCount: number;
};

export const ANONYMOUS_DRAFT_STORAGE_KEY = "quizzy:anonymous-draft";

let nextDraftId = 0;
const draftId = (): string => {
  nextDraftId += 1;
  return `${Date.now().toString(36)}-${nextDraftId.toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const answer = (text = "", correct = false): AnswerDraft => ({
  clientId: draftId(),
  text,
  correct,
});
export const newQuestion = (): QuestionDraft => ({
  clientId: draftId(),
  prompt: "",
  points: 1000,
  timeLimitSeconds: 20,
  answers: [answer("", true), answer(), answer()],
});
export const newQuiz = (): QuizDraft => ({
  title: "",
  theme: "game-show",
  isPublic: false,
  questions: [newQuestion()],
});

export function loadAnonymousDraft(): QuizDraft | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = window.localStorage.getItem(ANONYMOUS_DRAFT_STORAGE_KEY);
    if (!stored) return undefined;
    const parsed = JSON.parse(stored) as QuizDraft;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.title !== "string" ||
      !Array.isArray(parsed.questions)
    )
      return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function saveAnonymousDraft(quiz: QuizDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ANONYMOUS_DRAFT_STORAGE_KEY,
      JSON.stringify(quiz),
    );
  } catch {
    // Storage may be unavailable in private browsing or restricted contexts.
  }
}

export function clearAnonymousDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ANONYMOUS_DRAFT_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in private browsing or restricted contexts.
  }
}

export function quizPayload(quiz: QuizDraft) {
  return {
    title: quiz.title,
    theme: quiz.theme,
    isPublic: quiz.isPublic ?? false,
    questions: quiz.questions
      .filter(({ prompt }) => prompt.trim().length > 0)
      .map(({ prompt, points, timeLimitSeconds, answers }) => ({
        prompt,
        points,
        timeLimitSeconds,
        answers: answers
          .filter(({ text }) => text.trim().length > 0)
          .map(({ text, correct }) => ({ text, correct })),
      })),
  };
}

type ApiQuiz = {
  id: string;
  title: string;
  theme: Theme;
  isPublic?: boolean;
  questions: {
    prompt: string;
    points: number;
    timeLimitSeconds: number;
    answers: { text: string; correct: boolean }[];
  }[];
};
export function draftFromApi(quiz: ApiQuiz): QuizDraft {
  const questions = quiz.questions.map((question) => ({
    clientId: draftId(),
    prompt: question.prompt,
    points: question.points,
    timeLimitSeconds: question.timeLimitSeconds,
    answers: [
      ...question.answers.map((item) => ({
        clientId: draftId(),
        text: item.text,
        correct: item.correct,
      })),
      ...(question.answers.length < 6 ? [answer()] : []),
    ],
  }));
  if (questions.length && questions[questions.length - 1]!.prompt.trim())
    questions.push(newQuestion());
  return {
    id: quiz.id,
    title: quiz.title,
    theme: quiz.theme,
    isPublic: quiz.isPublic ?? false,
    questions,
  };
}
export type { ApiQuiz };
