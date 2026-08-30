# Hands-on testing

## Start Quizzy

The local `.env` is configured to serve the built browser application, API, and WebSocket endpoint from one Node.js process.

```bash
cd /code/quizzy
npm run build
npm start
```

Open `http://127.0.0.1:3000`. Register with an email address and a password containing at least 12 characters. Confirm that the creator dashboard appears, refresh the page to confirm the session persists, log out, then log back in.

Create a quiz and exercise the authoring flow:

1. Enter a title and choose a theme.
2. Enter a question, points, time limit, and two to six answers.
3. Select exactly one correct answer.
4. Add a second question and use the ordering controls.
5. Save, reopen, edit, and save the quiz again.
6. Confirm deletion only after reviewing its confirmation prompt.

Launch a saved quiz:

1. Click **Launch** on a quiz card.
2. Confirm that the host lobby shows the quiz title, six-character join code, join URL, QR code, and zero players.
   When the host page was opened through `localhost` in development, confirm the displayed/encoded URL uses the laptop's private LAN IP and preserves port `5173`.
3. Scan the QR code with a phone on the same local network, enter a nickname, and join without logging in.
4. Confirm the phone shows its waiting screen and the nickname immediately appears on the host screen.
5. Open the join URL in another private browser window and confirm a second nickname appears in real time.
6. Try the first nickname again with different capitalization and confirm it is rejected.
7. Confirm **Start quiz** is disabled before anyone joins and enabled afterward.
8. Click **Start quiz** and confirm the first question, answer choices, points, and server-derived countdown appear on both screens.
9. Tap an answer on the phone and confirm it becomes selected, the phone reports **Answer received!**, and the host count changes to `1 / N answered` immediately.
10. Confirm a second tap cannot change the submitted answer and the phone never indicates whether it was correct.
11. Confirm an answer after the countdown reaches zero is rejected and that a new player can no longer join.
12. Click **Show results** and confirm the correct option, votes per option, and top-five leaderboard appear on both screens.
13. Click **Next question** and confirm the host shows only the question for ten seconds with a preview progress bar. Confirm answer controls appear simultaneously on the host and phones, then answer and verify scores accumulate after reveal. A correct answer submitted halfway through its answer timer should receive approximately 75% of its configured points; one at the deadline receives half.
14. On the final result screen click **Finish quiz** and confirm both screens show the top-three podium and final leaderboard.
15. Return to the dashboard and confirm the completed quiz can launch again.

Also launch a fresh run, join from a phone, and use **Cancel quiz** during an open question or result screen. Confirm the host returns to the dashboard, the phone reports that the host cancelled, the authored quiz remains, and it can immediately launch again.

For the normal hot-reload workflow, run `npm run dev` and open the Vite URL shown in the client log. It starts both the Fastify and Vite development processes.

## Inspect PostgreSQL

```bash
PGPASSWORD=quizzy psql -h 127.0.0.1 -U quizzy -d quizzy_development
```

Inside `psql`:

```text
\dt
\d creators
\d creator_sessions
\d quizzes
\d questions
\d answer_options
\d live_sessions
\d players
\d question_rounds
\d answer_submissions
SELECT id, email, created_at FROM creators;
SELECT id, creator_id, left(token_hash, 12) AS token_hash_prefix, created_at, expires_at FROM creator_sessions;
SELECT id, creator_id, title, theme, created_at, updated_at FROM quizzes;
SELECT id, quiz_id, position, prompt, points, time_limit_seconds FROM questions ORDER BY quiz_id, position;
SELECT id, question_id, position, text, is_correct FROM answer_options ORDER BY question_id, position;
SELECT id, quiz_id, host_creator_id, join_code, state, revision, created_at FROM live_sessions ORDER BY created_at;
SELECT id, live_session_id, nickname, left(token_hash, 12) AS token_hash_prefix, joined_at FROM players ORDER BY joined_at;
SELECT id, live_session_id, question_id, position, opened_at, closes_at, closed_at FROM question_rounds ORDER BY opened_at;
SELECT id, question_round_id, player_id, answer_option_id, received_at, is_correct, points_awarded FROM answer_submissions ORDER BY received_at;
\q
```

Passwords are stored only as scrypt hashes. Creator session tokens and player credentials are stored only as SHA-256 hashes. None of the original secrets can be recovered from the database.
