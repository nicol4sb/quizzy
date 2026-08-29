# Quizzy

Quizzy is a browser-based live quiz application. A creator prepares a multiple-choice quiz, launches a lobby, and presents the quiz on a shared screen. Players scan a QR code, enter a nickname, and answer from their phones without creating accounts.

The MVP deliberately focuses on the live multiplayer experience. AI-assisted quiz generation, player accounts, reconnection, monetization, and infrastructure for horizontal scaling are deferred.

## Project guidance

The canonical product and technical decisions are recorded in [docs/architecture.md](docs/architecture.md). Read that document before making architectural or scope changes.

Local setup and verification are documented in [docs/development.md](docs/development.md).
The current feature can be exercised using [docs/manual-testing.md](docs/manual-testing.md).

## MVP at a glance

- Creator registration and authentication
- Quiz creation through a structured form
- Multiple-choice questions with exactly one correct answer
- Configurable score and time limit per question
- QR-code lobby and nickname-only player entry
- Joining closes permanently when the quiz begins
- Host-controlled question and result progression
- Speed-weighted scoring from full points down to half at the deadline
- Real-time question, answer-count, result, leaderboard, and podium updates
- One application deployment and PostgreSQL initially
- Clean boundaries for future independent HTTP and WebSocket scaling

## Status

The complete alpha quiz flow is implemented: creator authentication and authoring, anonymous joining, timed multi-question play, authenticated answers, real-time progress, host cancellation, result reveals, cumulative scoring, leaderboards, and a final podium. Reconnection, operational hardening, and load testing remain deliberately deferred.
