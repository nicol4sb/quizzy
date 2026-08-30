import type { FormEvent } from "react";
import { newQuestion, type QuizDraft } from "./quizzes";
import { hasRichFormatting, RichText } from "./RichText";

type Props = {
  quiz: QuizDraft;
  saving: boolean;
  error: string;
  onChange: (quiz: QuizDraft) => void;
  onCancel: () => void;
  onSave: () => Promise<void>;
};

export function QuizEditor({
  quiz,
  saving,
  error,
  onChange,
  onCancel,
  onSave,
}: Props) {
  function updateQuestion(
    index: number,
    patch: Partial<QuizDraft["questions"][number]>,
  ) {
    onChange({
      ...quiz,
      questions: quiz.questions.map((question, position) =>
        position === index ? { ...question, ...patch } : question,
      ),
    });
  }
  function moveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= quiz.questions.length) return;
    const questions = [...quiz.questions];
    [questions[index], questions[target]] = [
      questions[target]!,
      questions[index]!,
    ];
    onChange({ ...quiz, questions });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave();
  }

  return (
    <form className="quiz-editor" onSubmit={(event) => void submit(event)}>
      <header className="editor-header">
        <div>
          <p className="eyebrow">{quiz.id ? "Edit quiz" : "New quiz"}</p>
          <h2>{quiz.id ? quiz.title : "Create a quiz"}</h2>
        </div>
        <button type="button" className="secondary" onClick={onCancel}>
          Back to quizzes
        </button>
      </header>
      <div className="quiz-settings">
        <label>
          Quiz title
          <input
            value={quiz.title}
            maxLength={72}
            required
            onChange={(event) =>
              onChange({ ...quiz, title: event.target.value })
            }
          />
        </label>
        <label>
          Theme
          <select
            value={quiz.theme}
            onChange={(event) =>
              onChange({
                ...quiz,
                theme: event.target.value as QuizDraft["theme"],
              })
            }
          >
            <option value="game-show">Game show</option>
            <option value="classroom">Classroom</option>
            <option value="neon-arcade">Neon arcade</option>
            <option value="minimal">Minimal</option>
          </select>
        </label>
      </div>
      {quiz.questions.map((question, questionIndex) => (
        <fieldset className="question-card" key={question.clientId}>
          <legend>Question {questionIndex + 1}</legend>
          <details className="formatting-help">
            <summary aria-label="Show code and math formatting examples">
              <span className="formatting-info-icon" aria-hidden="true">
                i
              </span>
              <span className="sr-only">Code and math formatting examples</span>
            </summary>
            <div>
              <p>
                Questions and answers support code and LaTeX. Quiz titles stay
                plain text.
              </p>
              <dl>
                <dt>Inline code</dt>
                <dd>
                  <code>`SELECT * FROM players`</code>
                </dd>
                <dt>Code block</dt>
                <dd>
                  <pre>{"```sql\nSELECT score FROM players;\n```"}</pre>
                </dd>
                <dt>Answer snippet</dt>
                <dd>
                  <code>{"```javascript const total = 2 + 2;```"}</code>
                </dd>
                <dt>Inline math</dt>
                <dd>
                  <code>{"\\(E = mc^2\\)"}</code>
                </dd>
                <dt>Display math</dt>
                <dd>
                  <code>{"$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$"}</code>
                </dd>
              </dl>
            </div>
          </details>
          <div className="question-actions">
            <button
              type="button"
              className="secondary compact"
              disabled={questionIndex === 0}
              onClick={() => moveQuestion(questionIndex, -1)}
            >
              Move up
            </button>
            <button
              type="button"
              className="secondary compact"
              disabled={questionIndex === quiz.questions.length - 1}
              onClick={() => moveQuestion(questionIndex, 1)}
            >
              Move down
            </button>
            <button
              type="button"
              className="danger compact"
              disabled={quiz.questions.length === 1}
              onClick={() =>
                onChange({
                  ...quiz,
                  questions: quiz.questions.filter(
                    (_, index) => index !== questionIndex,
                  ),
                })
              }
            >
              Remove
            </button>
          </div>
          <label>
            Question text
            <textarea
              value={question.prompt}
              maxLength={180}
              required
              onChange={(event) =>
                updateQuestion(questionIndex, { prompt: event.target.value })
              }
            />
          </label>
          {hasRichFormatting(question.prompt) && (
            <div className="rich-preview">
              <small>Question preview</small>
              <RichText text={question.prompt} />
            </div>
          )}
          <div className="question-settings">
            <label>
              Points
              <input
                type="number"
                min={1}
                max={100000}
                value={question.points}
                onChange={(event) =>
                  updateQuestion(questionIndex, {
                    points: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Time (seconds)
              <input
                type="number"
                min={5}
                max={300}
                value={question.timeLimitSeconds}
                onChange={(event) =>
                  updateQuestion(questionIndex, {
                    timeLimitSeconds: Number(event.target.value),
                  })
                }
              />
            </label>
          </div>
          <div className="answers">
            <p>Answers — select the correct one</p>
            {question.answers.map((answer, answerIndex) => (
              <div className="answer-row" key={answer.clientId}>
                <input
                  aria-label={`Mark answer ${answerIndex + 1} correct`}
                  type="radio"
                  name={`correct-${question.clientId}`}
                  checked={answer.correct}
                  onChange={() =>
                    updateQuestion(questionIndex, {
                      answers: question.answers.map((item, index) => ({
                        ...item,
                        correct: index === answerIndex,
                      })),
                    })
                  }
                />
                <input
                  aria-label={`Answer ${answerIndex + 1}`}
                  value={answer.text}
                  maxLength={200}
                  required
                  onChange={(event) =>
                    updateQuestion(questionIndex, {
                      answers: question.answers.map((item, index) =>
                        index === answerIndex
                          ? { ...item, text: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="danger compact"
                  disabled={question.answers.length <= 2}
                  onClick={() => {
                    const answers = question.answers.filter(
                      (_, index) => index !== answerIndex,
                    );
                    if (!answers.some((item) => item.correct))
                      answers[0] = { ...answers[0]!, correct: true };
                    updateQuestion(questionIndex, { answers });
                  }}
                >
                  Remove
                </button>
                {hasRichFormatting(answer.text) && (
                  <div className="rich-preview answer-rich-preview">
                    <small>Preview</small>
                    <RichText text={answer.text} />
                  </div>
                )}
              </div>
            ))}
            <button
              type="button"
              className="secondary"
              disabled={question.answers.length >= 6}
              onClick={() =>
                updateQuestion(questionIndex, {
                  answers: [
                    ...question.answers,
                    { clientId: crypto.randomUUID(), text: "", correct: false },
                  ],
                })
              }
            >
              Add answer
            </button>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className="secondary"
        onClick={() =>
          onChange({ ...quiz, questions: [...quiz.questions, newQuestion()] })
        }
      >
        Add question
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button disabled={saving}>{saving ? "Saving…" : "Save quiz"}</button>
    </form>
  );
}
