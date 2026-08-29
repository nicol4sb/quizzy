import { describe, expect, it } from "vitest";
import { draftFromApi, newQuiz } from "./quizzes";

describe("quiz drafts", () => {
  it("creates unique local IDs without Web Crypto", () => {
    const first = newQuiz();
    const second = newQuiz();
    const ids = [
      first.questions[0]!.clientId,
      ...first.questions[0]!.answers.map((answer) => answer.clientId),
      second.questions[0]!.clientId,
      ...second.questions[0]!.answers.map((answer) => answer.clientId),
    ];

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("adds local IDs when loading a quiz from the API", () => {
    const draft = draftFromApi({
      id: "quiz-id",
      title: "Loaded quiz",
      theme: "minimal",
      questions: [
        {
          prompt: "Question?",
          points: 100,
          timeLimitSeconds: 20,
          answers: [
            { text: "Yes", correct: true },
            { text: "No", correct: false },
          ],
        },
      ],
    });

    expect(draft.questions[0]!.clientId).toBeTruthy();
    expect(draft.questions[0]!.answers.every((answer) => answer.clientId)).toBe(
      true,
    );
  });
});
