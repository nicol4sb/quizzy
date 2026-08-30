export async function currentQuestion(database, sessionId) {
    const questionResult = await database.query(`SELECT r.id AS round_id, q.prompt, r.position, q.points,
            q.time_limit_seconds, r.opened_at, r.answers_available_at, r.closes_at,
            (SELECT count(*)::integer FROM questions all_q WHERE all_q.quiz_id = q.quiz_id) AS total_questions
       FROM question_rounds r
       JOIN questions q ON q.id = r.question_id
      WHERE r.live_session_id = $1
      ORDER BY r.position DESC
      LIMIT 1`, [sessionId]);
    const question = questionResult.rows[0];
    if (!question)
        return undefined;
    const answers = await database.query(`SELECT a.id, a.text, a.position
       FROM answer_options a
       JOIN question_rounds r ON r.question_id = a.question_id
      WHERE r.id = $1
      ORDER BY a.position`, [question.round_id]);
    return {
        roundId: question.round_id,
        prompt: question.prompt,
        position: question.position,
        totalQuestions: question.total_questions,
        points: question.points,
        timeLimitSeconds: question.time_limit_seconds,
        openedAt: question.opened_at,
        answersAvailableAt: question.answers_available_at,
        closesAt: question.closes_at,
        answers: answers.rows,
    };
}
//# sourceMappingURL=current-question.js.map