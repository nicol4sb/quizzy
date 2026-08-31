import { useEffect, useRef, useState, type FormEvent } from "react";
import { newQuestion, type QuizDraft } from "./quizzes";
import { hasRichFormatting, RichText } from "./RichText";

type Props = {
  quiz: QuizDraft;
  error: string;
  onChange: (quiz: QuizDraft) => void;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
  onSave: (draft?: QuizDraft, explicit?: boolean) => Promise<void>;
  saveState: "idle" | "saving" | "saved" | "queued" | "local";
  saveLabel?: string;
};

function CopyableExample({
  label,
  value,
  block = false,
}: {
  label: string;
  value: string;
  block?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard permissions can be unavailable in an insecure context.
    }
  }
  return (
    <div className="formatting-example">
      <div className="formatting-example-header">
        <span>{label}</span>
        <button
          type="button"
          className="copy-code-button"
          aria-label={`Copy ${label}`}
          title={`Copy ${label}`}
          onClick={() => void copy()}
        >
          <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
        </button>
      </div>
      {block ? <pre>{value}</pre> : <code>{value}</code>}
    </div>
  );
}

function FormattingGuide() {
  return (
    <aside className="formatting-guide" aria-label="Code and math formatting">
      <div className="formatting-guide-heading">
        <span>Formatting guide</span>
      </div>
      <p>
        Questions and answers support code and LaTeX. Quiz titles stay plain.
      </p>
      <CopyableExample label="Inline SQL" value="`SELECT * FROM players`" />
      <CopyableExample
        label="SQL block"
        value={"```sql\nSELECT score FROM players;\n```"}
        block
      />
      <CopyableExample
        label="JavaScript"
        value={"```javascript const total = 2 + 2;```"}
      />
      <CopyableExample label="Inline math" value={"\\(E = mc^2\\)"} />
      <CopyableExample
        label="Display math"
        value={"$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$"}
      />
    </aside>
  );
}

function InlineEditable({
  value,
  maxLength,
  className,
  ariaLabel,
  title,
  placeholder,
  onChange,
  onBlur,
  onFocus,
}: {
  value: string;
  maxLength: number;
  className?: string;
  ariaLabel: string;
  title?: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  onFocus?: () => void;
}) {
  const editableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = editableRef.current;
    if (
      element &&
      document.activeElement !== element &&
      element.textContent !== value
    )
      element.textContent = value;
  }, [value]);

  return (
    <div
      ref={editableRef}
      className={`inline-editable${className ? ` ${className}` : ""}`}
      contentEditable
      role="textbox"
      aria-label={ariaLabel}
      title={title}
      data-placeholder={placeholder}
      aria-multiline={className?.includes("question-edit") || undefined}
      suppressContentEditableWarning
      onInput={(event) => {
        const element = event.currentTarget;
        const next = element.textContent ?? "";
        if (next.length > maxLength) {
          element.textContent = next.slice(0, maxLength);
          const selection = window.getSelection();
          selection?.selectAllChildren(element);
          selection?.collapseToEnd();
        }
        onChange((element.textContent ?? "").slice(0, maxLength));
      }}
      onBlur={onBlur}
      onFocus={onFocus}
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        const selection = window.getSelection();
        if (!selection) return;
        const documentWithCaret = document as Document & {
          caretPositionFromPoint?: (
            x: number,
            y: number,
          ) => { offsetNode: Node; offset: number } | null;
          caretRangeFromPoint?: (x: number, y: number) => Range | null;
        };
        const range = documentWithCaret.caretRangeFromPoint?.(
          event.clientX,
          event.clientY,
        );
        if (range) {
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        }
        const caret = documentWithCaret.caretPositionFromPoint?.(
          event.clientX,
          event.clientY,
        );
        if (caret) {
          const fallback = document.createRange();
          fallback.setStart(caret.offsetNode, caret.offset);
          fallback.collapse(true);
          selection.removeAllRanges();
          selection.addRange(fallback);
        }
      }}
    />
  );
}

export function QuizEditor({
  quiz,
  error,
  onChange,
  onCancel,
  onDelete,
  onSave,
  saveState,
  saveLabel,
}: Props) {
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const visibleQuestionIndex = Math.min(
    activeQuestionIndex,
    Math.max(quiz.questions.length - 1, 0),
  );
  useEffect(() => {
    if (activeQuestionIndex !== visibleQuestionIndex)
      setActiveQuestionIndex(visibleQuestionIndex);
  }, [activeQuestionIndex, visibleQuestionIndex]);
  function updateQuestion(
    index: number,
    patch: Partial<QuizDraft["questions"][number]>,
  ) {
    const questions = quiz.questions.map((question, position) =>
      position === index ? { ...question, ...patch } : question,
    );
    if (index === questions.length - 1 && patch.prompt?.trim())
      questions.push(newQuestion());
    onChange({
      ...quiz,
      questions,
    });
  }
  function persist(next: QuizDraft) {
    onChange(next);
    void onSave(next);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave(undefined, true);
  }
  function saveOnBlur() {
    window.setTimeout(() => void onSave(undefined, false), 0);
  }

  return (
    <form className="quiz-editor" onSubmit={(event) => void submit(event)}>
      <div className="quiz-settings">
        <div className="title-editor">
          <button
            type="button"
            className="secondary editor-back-button"
            title="Back to quizzes"
            aria-label="Back to quizzes"
            onClick={onCancel}
          >
            <span aria-hidden="true">←</span>
          </button>
          <InlineEditable
            value={quiz.title}
            maxLength={72}
            ariaLabel="Quiz title"
            title="Click to edit quiz title"
            placeholder="Untitled quiz"
            onChange={(title) => onChange({ ...quiz, title })}
            onBlur={saveOnBlur}
          />
        </div>
        <div className="quiz-actions-bubble" aria-label="Quiz actions">
          <button
            type="button"
            className={`icon-button ${quiz.isPublic ? "is-public" : ""}`}
            title={quiz.isPublic ? "Public quiz" : "Make quiz public"}
            aria-label={quiz.isPublic ? "Public quiz" : "Make quiz public"}
            onClick={() => persist({ ...quiz, isPublic: !quiz.isPublic })}
          >
            <span aria-hidden="true">◉</span>
          </button>
          {quiz.id && onDelete && (
            <button
              type="button"
              className="icon-button danger-icon"
              title="Delete quiz"
              aria-label="Delete quiz"
              onClick={() => void onDelete()}
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
      </div>
      <FormattingGuide />
      <div className="question-carousel" aria-label="Quiz questions">
        {visibleQuestionIndex > 0 && (
          <button
            type="button"
            className="carousel-arrow carousel-arrow-previous"
            aria-label="Previous question"
            title="Previous question"
            onClick={() => {
              saveOnBlur();
              setActiveQuestionIndex((index) => Math.max(index - 1, 0));
            }}
          >
            <span aria-hidden="true">←</span>
          </button>
        )}
        <div className="question-carousel-stage">
          <div className="question-carousel-meta" aria-live="polite">
            <span>
              Question {visibleQuestionIndex + 1} of {quiz.questions.length}
            </span>
            <span className="question-carousel-tip">
              One focused idea, one clear correct answer.
            </span>
          </div>
          {quiz.questions.map((question, questionIndex) =>
            questionIndex === visibleQuestionIndex ? (
              <fieldset className="question-card" key={question.clientId}>
                <legend>
                  <span className="sr-only">Question {questionIndex + 1}</span>
                </legend>
                <div className="question-card-toolbar">
                  <div
                    className="question-settings"
                    aria-label="Points and time"
                  >
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
                        onBlur={saveOnBlur}
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
                        onBlur={saveOnBlur}
                      />
                    </label>
                  </div>
                  {quiz.questions.length > 1 && (
                    <button
                      type="button"
                      className="question-delete-button"
                      title="Delete question"
                      onClick={() =>
                        persist({
                          ...quiz,
                          questions: quiz.questions.filter(
                            (_, index) => index !== questionIndex,
                          ),
                        })
                      }
                    >
                      Delete question
                    </button>
                  )}
                </div>
                <div className="prompt-editor">
                  <InlineEditable
                    value={question.prompt}
                    maxLength={180}
                    className="question-edit"
                    ariaLabel={`Question ${questionIndex + 1} text`}
                    title="Click to edit question"
                    placeholder="Write a focused question…"
                    onChange={(prompt) =>
                      updateQuestion(questionIndex, { prompt })
                    }
                    onBlur={saveOnBlur}
                  />
                </div>
                {hasRichFormatting(question.prompt) && (
                  <div className="rich-preview">
                    <small>Question preview</small>
                    <RichText text={question.prompt} />
                  </div>
                )}
                <div className="answers">
                  <div className="answers-heading">
                    <span>Possible answers</span>
                    <small>Keep choices plausible and mark the best one.</small>
                  </div>
                  {question.answers.map((answer, answerIndex) => (
                    <div
                      className={`answer-row${answer.correct ? " is-correct" : ""}${answerIndex < 2 ? " answer-required" : ""}`}
                      key={answer.clientId}
                    >
                      <button
                        type="button"
                        className="answer-correct-toggle"
                        aria-label={`${answer.correct ? "Correct answer" : "Mark answer"} ${answerIndex + 1}`}
                        title={
                          answer.correct ? "Correct answer" : "Mark as correct"
                        }
                        aria-pressed={answer.correct}
                        onClick={() =>
                          persist({
                            ...quiz,
                            questions: quiz.questions.map((item, position) =>
                              position === questionIndex
                                ? {
                                    ...item,
                                    answers: item.answers.map(
                                      (answer, index) => ({
                                        ...answer,
                                        correct: index === answerIndex,
                                      }),
                                    ),
                                  }
                                : item,
                            ),
                          })
                        }
                      >
                        ✓
                      </button>
                      <InlineEditable
                        ariaLabel={`Answer ${answerIndex + 1}`}
                        value={answer.text}
                        maxLength={200}
                        className="answer-edit"
                        placeholder={
                          answerIndex < 2
                            ? "Required answer…"
                            : "Add another answer…"
                        }
                        onChange={(text) => {
                          const answers = question.answers.map((item, index) =>
                            index === answerIndex ? { ...item, text } : item,
                          );
                          if (
                            answerIndex === answers.length - 1 &&
                            text.trim() &&
                            answers.length < 6
                          )
                            answers.push({
                              clientId: crypto.randomUUID(),
                              text: "",
                              correct: false,
                            });
                          updateQuestion(questionIndex, { answers });
                        }}
                        onBlur={saveOnBlur}
                      />
                      <button
                        type="button"
                        className="danger compact icon-button"
                        aria-label={`Remove answer ${answerIndex + 1}`}
                        title="Remove answer"
                        disabled={question.answers.length <= 2}
                        onClick={() => {
                          const answers = question.answers.filter(
                            (_, index) => index !== answerIndex,
                          );
                          if (!answers.some((item) => item.correct))
                            answers[0] = { ...answers[0]!, correct: true };
                          persist({
                            ...quiz,
                            questions: quiz.questions.map((item, position) =>
                              position === questionIndex
                                ? { ...item, answers }
                                : item,
                            ),
                          });
                        }}
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                      {hasRichFormatting(answer.text) && (
                        <div className="rich-preview answer-rich-preview">
                          <small>Preview</small>
                          <RichText text={answer.text} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </fieldset>
            ) : null,
          )}
        </div>
        {visibleQuestionIndex < quiz.questions.length - 1 && (
          <button
            type="button"
            className="carousel-arrow carousel-arrow-next"
            aria-label="Next question"
            title="Next question"
            onClick={() => {
              saveOnBlur();
              setActiveQuestionIndex((index) =>
                Math.min(index + 1, quiz.questions.length - 1),
              );
            }}
          >
            <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {saveLabel && (
        <button
          type="button"
          className="quiz-editor-save-button"
          onClick={() => void onSave(undefined, true)}
        >
          {saveLabel}
        </button>
      )}
      <p className={`save-status save-status-${saveState}`} role="status">
        {saveState === "saving"
          ? "Saving quiz…"
          : saveState === "local"
            ? "✓ Draft saved on this device"
            : saveState === "queued"
              ? "✓ Saved for the next session"
              : "✓ Quiz saved"}
      </p>
    </form>
  );
}
