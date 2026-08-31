-- Canonical Quizzy schema for a fresh alpha database.

CREATE TABLE IF NOT EXISTS creators (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creators_email_normalized CHECK (email = lower(trim(email)))
);

CREATE TABLE IF NOT EXISTS creator_sessions (
  id uuid PRIMARY KEY,
  creator_id uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS creator_sessions_creator_id_idx ON creator_sessions(creator_id);
CREATE INDEX IF NOT EXISTS creator_sessions_expires_at_idx ON creator_sessions(expires_at);

CREATE TABLE IF NOT EXISTS quizzes (
  id uuid PRIMARY KEY,
  creator_id uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  title text NOT NULL,
  theme text NOT NULL DEFAULT 'game-show',
  is_public boolean NOT NULL DEFAULT false,
  play_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quizzes_title_length CHECK (char_length(title) BETWEEN 1 AND 72),
  CONSTRAINT quizzes_play_count_valid CHECK (play_count >= 0),
  CONSTRAINT quizzes_theme_valid CHECK (theme IN ('game-show', 'classroom', 'neon-arcade', 'minimal'))
);

ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS play_count integer NOT NULL DEFAULT 0;
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS pending_payload jsonb;

CREATE INDEX IF NOT EXISTS quizzes_creator_updated_idx ON quizzes(creator_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS live_sessions (
  id uuid PRIMARY KEY,
  quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  host_creator_id uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  join_code char(6) NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'LOBBY',
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  CONSTRAINT live_sessions_state_valid CHECK (state IN ('LOBBY', 'QUESTION_OPEN', 'QUESTION_CLOSED', 'RESULTS', 'LEADERBOARD', 'FINISHED')),
  CONSTRAINT live_sessions_revision_valid CHECK (revision > 0)
);

CREATE INDEX IF NOT EXISTS live_sessions_host_created_idx ON live_sessions(host_creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS live_sessions_quiz_state_idx ON live_sessions(quiz_id, state);
CREATE UNIQUE INDEX IF NOT EXISTS live_sessions_one_active_quiz_idx ON live_sessions(quiz_id) WHERE state <> 'FINISHED';

CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY,
  live_session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  nickname text NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT players_nickname_length CHECK (char_length(trim(nickname)) BETWEEN 1 AND 24)
);

CREATE UNIQUE INDEX IF NOT EXISTS players_session_nickname_ci_idx
  ON players(live_session_id, lower(nickname));
CREATE INDEX IF NOT EXISTS players_session_joined_idx
  ON players(live_session_id, joined_at, id);

CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY,
  quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position integer NOT NULL,
  prompt text NOT NULL,
  points integer NOT NULL,
  time_limit_seconds integer NOT NULL,
  CONSTRAINT questions_position_valid CHECK (position >= 0),
  CONSTRAINT questions_prompt_length CHECK (char_length(prompt) BETWEEN 1 AND 180),
  CONSTRAINT questions_points_valid CHECK (points BETWEEN 1 AND 100000),
  CONSTRAINT questions_time_limit_valid CHECK (time_limit_seconds BETWEEN 5 AND 300),
  UNIQUE (quiz_id, position)
);

CREATE TABLE IF NOT EXISTS answer_options (
  id uuid PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  position integer NOT NULL,
  text text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  CONSTRAINT answer_options_position_valid CHECK (position >= 0),
  CONSTRAINT answer_options_text_length CHECK (char_length(text) BETWEEN 1 AND 200),
  UNIQUE (question_id, position)
);

CREATE INDEX IF NOT EXISTS answer_options_question_idx ON answer_options(question_id);

CREATE TABLE IF NOT EXISTS question_rounds (
  id uuid PRIMARY KEY,
  live_session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  position integer NOT NULL,
  opened_at timestamptz NOT NULL,
  answers_available_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  closed_at timestamptz,
  CONSTRAINT question_rounds_position_valid CHECK (position >= 0),
  CONSTRAINT question_rounds_answer_window_valid CHECK (
    answers_available_at >= opened_at AND closes_at > answers_available_at
  ),
  UNIQUE (live_session_id, position),
  UNIQUE (live_session_id, question_id)
);

-- Keep disposable alpha databases created from an earlier schema usable.
ALTER TABLE question_rounds
  ADD COLUMN IF NOT EXISTS answers_available_at timestamptz DEFAULT now();
ALTER TABLE question_rounds
  ALTER COLUMN answers_available_at SET NOT NULL;
ALTER TABLE question_rounds
  ALTER COLUMN answers_available_at DROP DEFAULT;

CREATE INDEX IF NOT EXISTS question_rounds_session_open_idx
  ON question_rounds(live_session_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS answer_submissions (
  id uuid PRIMARY KEY,
  question_round_id uuid NOT NULL REFERENCES question_rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  answer_option_id uuid NOT NULL REFERENCES answer_options(id) ON DELETE RESTRICT,
  received_at timestamptz NOT NULL DEFAULT now(),
  is_correct boolean NOT NULL,
  points_awarded integer NOT NULL,
  CONSTRAINT answer_submissions_points_valid CHECK (points_awarded >= 0),
  UNIQUE (question_round_id, player_id)
);

CREATE INDEX IF NOT EXISTS answer_submissions_round_received_idx
  ON answer_submissions(question_round_id, received_at);
