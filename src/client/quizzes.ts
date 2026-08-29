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
  questions: QuestionDraft[];
};
export type QuizSummary = {
  id: string;
  title: string;
  theme: Theme;
  questionCount: number;
  updatedAt: string;
  activeSessionId: string | null;
};

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
  answers: [answer("", true), answer(), answer(), answer()],
});
export const newQuiz = (): QuizDraft => ({
  title: "",
  theme: "game-show",
  questions: [newQuestion()],
});

export function quizPayload(quiz: QuizDraft) {
  return {
    title: quiz.title,
    theme: quiz.theme,
    questions: quiz.questions.map(
      ({ prompt, points, timeLimitSeconds, answers }) => ({
        prompt,
        points,
        timeLimitSeconds,
        answers: answers.map(({ text, correct }) => ({ text, correct })),
      }),
    ),
  };
}

type ApiQuiz = {
  id: string;
  title: string;
  theme: Theme;
  questions: {
    prompt: string;
    points: number;
    timeLimitSeconds: number;
    answers: { text: string; correct: boolean }[];
  }[];
};
export function draftFromApi(quiz: ApiQuiz): QuizDraft {
  return {
    id: quiz.id,
    title: quiz.title,
    theme: quiz.theme,
    questions: quiz.questions.map((question) => ({
      clientId: draftId(),
      prompt: question.prompt,
      points: question.points,
      timeLimitSeconds: question.timeLimitSeconds,
      answers: question.answers.map((item) => ({
        clientId: draftId(),
        text: item.text,
        correct: item.correct,
      })),
    })),
  };
}
export type { ApiQuiz };
