import { z } from "zod";
export const themes = [
    "game-show",
    "classroom",
    "neon-arcade",
    "minimal",
];
const answerSchema = z
    .object({
    text: z.string().trim().min(1).max(200),
    correct: z.boolean(),
})
    .strict();
const questionSchema = z
    .object({
    prompt: z.string().trim().min(1).max(180),
    points: z.number().int().min(1).max(100_000),
    timeLimitSeconds: z.number().int().min(5).max(300),
    answers: z.array(answerSchema).min(2).max(6),
})
    .strict()
    .superRefine((question, context) => {
    if (question.answers.filter((answer) => answer.correct).length !== 1) {
        context.addIssue({
            code: "custom",
            message: "Every question must have exactly one correct answer.",
            path: ["answers"],
        });
    }
});
export const quizInputSchema = z
    .object({
    title: z.string().trim().min(1).max(72),
    theme: z.enum(themes),
    questions: z.array(questionSchema).min(1).max(100),
})
    .strict();
// Updates also accept content created before the presentation-oriented limits
// were introduced, so an unchanged legacy quiz can still be saved.
const legacyQuestionSchema = z
    .object({
    prompt: z.string().trim().min(1).max(500),
    points: z.number().int().min(1).max(100_000),
    timeLimitSeconds: z.number().int().min(5).max(300),
    answers: z.array(answerSchema).min(2).max(6),
})
    .strict()
    .superRefine((question, context) => {
    if (question.answers.filter((answer) => answer.correct).length !== 1) {
        context.addIssue({
            code: "custom",
            message: "Every question must have exactly one correct answer.",
            path: ["answers"],
        });
    }
});
export const legacyQuizInputSchema = z
    .object({
    title: z.string().trim().min(1).max(120),
    theme: z.enum(themes),
    questions: z.array(legacyQuestionSchema).min(1).max(100),
})
    .strict();
//# sourceMappingURL=schema.js.map