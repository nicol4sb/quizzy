# Quizzy product and architecture

Status: accepted baseline for the MVP

This document records the product decisions and technical architecture agreed before implementation. It is the default guidance for future work. Changes should be intentional and reflected here.

## 1. Product objective

Quizzy lets a creator prepare and host a live multiple-choice quiz. The host projects a presentation screen while players use their phones as answer controllers.

The expected room size is approximately 50 players. This is an operating assumption, not a hard product limit. The longer-term platform target is approximately 10,000 concurrent users distributed across many independent quiz rooms.

## 2. MVP boundaries

### Included

- Creator registration, login, and quiz ownership
- Direct quiz creation and editing through a form
- Quiz title and visual theme
- Ordered questions
- Two to six answer options per question initially
- Exactly one correct answer per question
- Configurable score and time limit per question
- Quiz launch and host-controlled lobby
- Session-specific join URL and QR code
- Anonymous nickname-only player entry
- Same-device player recovery after transient disconnection or page restoration
- Real-time connected-player list in the lobby
- Host-controlled start, question progression, result reveal, and finish
- Real-time answered count
- Correct-answer reveal and vote totals
- Running leaderboard and final podium
- Server-authoritative deadlines, submissions, and scoring

### Explicitly deferred

- AI quiz generation or conversational editing
- Player accounts or login
- Late joining after the host starts the quiz
- Quiz versioning
- Multiple correct answers and free-text answers
- Speed-weighted scoring modes
- Native mobile applications
- Monetization
- Multiple application servers, load balancing, and Redis

Deferred infrastructure is anticipated through interfaces and stateless design but is not operated in the MVP.

## 3. Product rules

### Quiz editing

An edited quiz is the quiz; there is no version history. Quiz updates must be transactional so a failed save cannot leave partial question data.

A quiz cannot be edited while it has an active live session. This prevents questions, correct answers, deadlines, or scores from changing during play.

### Player entry

A player scans the QR code, opens the join page, enters a nickname, and joins. No email, password, verification, or durable account is required.

Joining is allowed only while the session is in `LOBBY`. Starting the first question closes joining permanently for that session. Joining and starting must be serialized transactionally so they cannot race.

### Disconnection

The player browser stores its anonymous credential in per-tab session storage. When a phone wakes, regains connectivity, or restores the tab, it reconnects its WebSocket and reads an authoritative HTTP snapshot. The snapshot restores the current question, the player's submitted answer for that round, revealed results, or the final leaderboard.

Recovery is limited to the same browser session and existing player credential. It does not permit late joining, moving a player to another device, choosing a new nickname, or recovering a deliberately cleared browser session.

### Scoring

The MVP uses fixed scoring:

- Correct answer: the question's configured points
- Incorrect answer: zero points

The server records submission receipt time even though speed does not affect the MVP score. This preserves the option to add speed-based scoring later.

## 4. Architectural boundaries

Quizzy separates three traffic planes:

```text
Browser
   |
   +-- HTTPS app.quizzy.example ---- nginx / web origin (CDN later)
   +-- HTTPS api.quizzy.example ---- stateless HTTP API
   +-- WSS   live.quizzy.example --- WebSocket service
                                           |
                                      room event bus
                                           |
                                      PostgreSQL
```

The hostnames are illustrative. The MVP may expose these services through paths on one host, but their responsibilities remain separate.

### Static web plane

Serves:

- HTML application shell
- JavaScript and CSS bundles
- Fonts, icons, sounds, backgrounds, and celebration assets

Static assets use content-hashed names and long cache lifetimes. nginx fronts the single Node.js origin in the MVP; a CDN can be added later without application changes. Neither static files nor a future CDN may contain private creator data, live state, player tokens, scores, or unrevealed correct answers.

### HTTP API plane

Handles short-lived commands and reads:

- Creator registration and authentication
- Quiz CRUD
- Session creation
- Public lobby lookup
- Anonymous player join
- Host commands
- Answer submissions
- Authoritative snapshots

Every mutating handler follows this pattern:

```text
authenticate/authorize
    -> validate
    -> atomic database transaction
    -> commit
    -> publish room event
    -> return response
```

An event is never published before its corresponding transaction commits.

API instances keep no request-dependent authoritative state and can later scale horizontally behind a load balancer.

### WebSocket plane

Handles:

- Long-lived browser connections
- Connection authentication
- Mapping local connections to quiz rooms
- Heartbeats
- Outbound real-time notifications
- Connection cleanup and current connected count

It does not calculate scores, accept authoritative deadlines, own session state, edit quizzes, or serve application assets.

WebSocket connections are inherently attached to a process, but they are not authoritative. Future WebSocket instances can scale independently by sharing room events through Redis.

## 5. MVP deployment

```text
Internet
   |
 nginx
   |
one application host
   +-- one Quizzy Node.js process
       +-- static web application
       +-- HTTP API
       +-- WebSocket endpoint
   |
self-hosted PostgreSQL
```

The MVP uses one Node.js process with explicit internal web, API, WebSocket, database, and room-event boundaries. nginx terminates TLS and proxies requests. The process and PostgreSQL are supervised by systemd. Production builds happen before deployment; Docker is not used.

Redis and a load balancer are intentionally absent from the MVP.

## 6. Future horizontal scaling

```text
CDN
 |
 +-- API load balancer
 |     +-- API instance 1
 |     +-- API instance 2
 |     +-- API instance N
 |
 +-- WebSocket load balancer
       +-- live instance 1
       +-- live instance 2
       +-- live instance N
                 |
              Redis
                 |
             PostgreSQL
```

The future transition consists of:

1. Add Redis.
2. Replace the in-memory room event bus with its Redis implementation.
3. Run multiple identical API and WebSocket instances.
4. Put WebSocket-aware load balancing in front of the live instances.
5. Add connection pooling appropriate to the expanded API fleet.

No game-domain or browser protocol changes should be necessary.

WebSocket instances scale based primarily on concurrent connections, memory, file descriptors, outbound messages, and event-loop lag. API instances scale based on request rate, latency, and database activity.

## 7. Room event bus

Application code depends on an interface rather than a transport:

```ts
interface RoomEventBus {
  publish(roomId: string, event: RoomEvent): Promise<void>;
  subscribe(roomId: string, handler: RoomEventHandler): Unsubscribe;
}
```

Implementations:

- MVP: in-memory delivery within the single deployment
- Later: Redis Pub/Sub across WebSocket instances

Room events are notifications, not durable truth. A client recovering from a missed event obtains an authoritative snapshot from the HTTP API.

## 8. Communication model

Use HTTP for commands and WebSockets for server-to-browser notifications.

### HTTP commands

- Join session
- Start quiz
- Submit answer
- Close question
- Reveal results
- Advance question
- Finish quiz

Benefits include ordinary response codes, straightforward authorization, database transactions, idempotency, testing, and future API scaling.

### WebSocket events

- `lobby_updated`
- `quiz_started`
- `question_opened`
- `answer_count_updated`
- `question_closed`
- `results_revealed`
- `leaderboard_updated`
- `quiz_finished`
- `session_ended`
- `error`

Events carry a session revision where relevant. Clients ignore older revisions. Correct-answer information must never appear in a player payload before results are revealed.

## 9. WebSocket lifecycle

### Establishment

1. The browser obtains a short-lived WebSocket credential over HTTP.
2. It opens `wss://.../ws`.
3. The server upgrades the HTTP request.
4. The browser sends an authentication message containing the session, role, and token.
5. The server validates it and adds the socket to the local room registry.

Conceptually:

```ts
Map<SessionId, Set<ClientConnection>>;
```

### Heartbeats

The server sends an application heartbeat approximately every 25 seconds. A connection that misses two responses is closed and removed. Any future load balancer idle timeout must exceed the heartbeat interval.

### Backpressure

One slow client must not block a room. Each socket has a bounded outgoing buffer. A client exceeding the limit is disconnected rather than consuming unbounded server memory.

Large assets are delivered through HTTPS/CDN URLs, never embedded in WebSocket messages.

## 10. Authoritative session state

The live quiz follows this state machine:

```text
LOBBY
  -> QUESTION_OPEN
  -> QUESTION_CLOSED
  -> RESULTS
  -> LEADERBOARD
  -> QUESTION_OPEN (next question)
  -> FINISHED
```

The exact separation of `RESULTS` and `LEADERBOARD` may be simplified in implementation, but legal transitions must be explicit and tested.

PostgreSQL stores:

- Current state
- Current question or round
- State revision
- Whether joining is closed
- `opened_at` and `closes_at`
- Players
- Submissions
- Score events and totals

Host commands include an expected revision. The database transaction locks the session, verifies the state and revision, applies one legal transition, increments the revision, and commits. This prevents stale tabs and duplicate clicks from advancing twice.

Deadlines use server time. Browser countdowns are visual aids derived from `closes_at`; they do not decide whether an answer is accepted.

## 11. End-to-end lifecycle

### Creator and authoring

1. nginx and the Node.js origin serve the application shell and static assets; a CDN may take over this cacheable traffic later.
2. Creator registers through the HTTP API.
3. API validates input, hashes the password or delegates authentication, creates the creator, and establishes a secure session.
4. Creator submits quiz data through HTTP.
5. API validates questions, option counts, exactly one correct answer, points, and timers.
6. API saves the entire quiz transactionally.

### Launch and lobby

1. Creator launches a saved quiz through HTTP.
2. API validates ownership and playability.
3. API creates a `LOBBY` session and unique join code.
4. Browser renders the QR code from the join URL.
5. Host fetches the authoritative lobby snapshot.
6. Host opens and authenticates a WebSocket.
7. Player scans the QR code; the static web plane serves the join application.
8. Browser fetches safe public lobby information from the API.
9. Player submits a nickname through HTTP.
10. API transaction confirms `LOBBY`, creates the anonymous player, and commits.
11. API returns session-specific player and WebSocket tokens.
12. API publishes `player_joined`/`lobby_updated`.
13. WebSocket service sends the updated lobby to the host.
14. Player opens and authenticates a WebSocket and enters the local room registry.

### Starting a question

1. Host sends an HTTP start command with expected revision.
2. API locks the session transactionally.
3. API verifies `LOBBY` and the revision.
4. API permanently closes joining.
5. API creates the first round, stores a ten-second answer-availability timestamp, and stores the later answer deadline.
6. API changes state, increments revision, and commits.
7. API publishes `question_opened`.
8. WebSocket service sends role-appropriate payloads to the host and players.
9. Host and player clients show the question position and preview countdown; only the host shows the full prompt.
10. After ten seconds, both clients reveal matching answer controls and the configured answer timer begins.
11. Player payload contains question and options but not correctness.

### Answering

1. Player submits an answer through HTTP with an idempotent submission ID.
2. API authenticates the anonymous session token.
3. API verifies session membership, answer-availability time, deadline, and option membership.
4. API inserts one submission per player and round using a database uniqueness constraint.
5. API records server receipt time, correctness, and score.
6. API commits.
7. API publishes an aggregated answer-count event.
8. WebSocket service sends the count to the host.
9. HTTP response acknowledges acceptance without revealing correctness.

Answer-count broadcasts should be debounced to several updates per second rather than broadcasting every individual submission.

### Revealing results

1. Host sends an HTTP reveal command with expected revision.
2. API locks and verifies the session.
3. API closes the round, aggregates votes, reads the correct answer, and calculates rankings.
4. API changes state, increments revision, and commits.
5. API publishes `results_revealed`.
6. WebSocket service sends the correct answer, vote totals, leaderboard, and role-appropriate personal results.

### Finishing

1. The question cycle repeats under host control.
2. Host finishes after the last question.
3. API stores final placements, changes state to `FINISHED`, and commits.
4. API publishes `quiz_finished`.
5. Browsers render the podium and celebration locally.
6. After a grace period, the WebSocket service closes the room and releases its local connection registry.

### Cancelling

The creator may cancel an active run from the lobby, an open question, or a result screen. Cancellation deletes the live session and its dependent players, rounds, and submissions while preserving the authored quiz, then publishes `session_ended` so connected players leave the active game UI.

## 12. Data model

Initial entities:

- `creators`
- `creator_sessions`
- `quizzes`
- `questions`
- `answer_options`
- `live_sessions`
- `players`
- `question_rounds`
- `answer_submissions`

Key constraints:

- Questions have an explicit order within a quiz.
- Answer options have an explicit order within a question.
- Every question has exactly one correct option, enforced by application validation and an appropriate database design.
- A player belongs to exactly one live session.
- A player can have at most one accepted submission per round.
- Join codes are unique while active.
- Host state transitions use an expected revision.

## 13. Security rules

- Creator authorization is checked on every quiz and host operation.
- Player tokens are opaque random credentials, stored only as hashes and restricted to one player and session.
- Public lobby endpoints expose no unrevealed question or correctness data.
- Joining and starting are protected against races.
- Correctness and scores are calculated server-side.
- Client timestamps are never trusted for deadlines or speed.
- Join, nickname, answer, authentication, and host endpoints are rate-limited.
- Nicknames have length and character restrictions.
- Passwords are never stored directly.
- Production traffic uses HTTPS and WSS.

## 14. Initial implementation order

Build a single-question vertical slice first:

1. Define runtime schemas for HTTP commands and WebSocket events.
2. Implement and test the session state machine.
3. Create the database schema and transactions.
4. Implement creator registration and one-question quiz creation.
5. Implement session launch and QR-code lobby.
6. Implement anonymous nickname join. **Complete.**
7. Implement host and player WebSocket authentication. **Complete.**
8. Start one question and broadcast it. **Complete.**
9. Accept and persist answers idempotently. **Complete.**
10. Show an aggregated answered count. **Complete.**
11. Reveal results, score the player, and show a podium. **Complete.**
12. Verify server-authoritative deadlines. **Complete.**
13. Restore same-device player sessions after transient mobile disconnections. **Complete.**

Then add cross-device recovery if justified, operational observability, rate limiting, and load tests.

## 15. Architectural invariants

Future implementation should preserve these rules:

1. The static web plane delivers the application; it does not own live state.
2. The API changes authoritative state.
3. WebSockets announce committed state changes.
4. PostgreSQL is the source of truth.
5. No correctness data is sent before reveal.
6. No important game state exists only in process memory.
7. Joining becomes impossible when the first question starts.
8. Player participation requires no account.
9. API instances remain horizontally scalable.
10. WebSocket scaling can be added by replacing the room event bus, not rewriting game logic.

Answer scoring is server-authoritative and linear in remaining time: a correct answer receives `maxPoints × (0.5 + 0.5 × remainingFraction)`, where `remainingFraction` is clamped from 0 to 1 using PostgreSQL receipt time. Integer scores round up; incorrect answers receive zero.
