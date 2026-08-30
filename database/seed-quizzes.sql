-- Sample quizzes for local development.
--
-- Run after registering a creator in the application:
--   psql "$DATABASE_URL" -v creator_email='you@example.com' -f database/seed-quizzes.sql

\set ON_ERROR_STOP on

\if :{?creator_email}
\else
  \echo 'Missing creator_email. Pass -v creator_email=you@example.com'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE seed_creator ON COMMIT DROP AS
SELECT id
FROM creators
WHERE email = lower(trim(:'creator_email'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM seed_creator) THEN
    RAISE EXCEPTION 'No creator exists with that email. Register in Quizzy first.';
  END IF;
END
$$;

CREATE TEMP TABLE seed_quiz_data (
  quiz_key text PRIMARY KEY,
  title text NOT NULL,
  theme text NOT NULL,
  questions jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO seed_quiz_data (quiz_key, title, theme, questions) VALUES
(
  'ww2-turning-points',
  'World War II: Turning Points',
  'game-show',
  $$[
    {"prompt":"Which 1939 event is generally considered the beginning of World War II in Europe?","points":1000,"seconds":20,"answers":[["Germany invaded Poland",true],["Germany annexed Austria",false],["Italy invaded Ethiopia",false],["Japan attacked Pearl Harbor",false]]},
    {"prompt":"What was the codename for Germany's 1941 invasion of the Soviet Union?","points":1000,"seconds":20,"answers":[["Operation Barbarossa",true],["Operation Sea Lion",false],["Operation Torch",false],["Operation Market Garden",false]]},
    {"prompt":"Which battle halted Japan's advance in the Pacific in June 1942?","points":1500,"seconds":20,"answers":[["Battle of Midway",true],["Battle of Okinawa",false],["Battle of Iwo Jima",false],["Battle of Leyte Gulf",false]]},
    {"prompt":"The Soviet victory at which battle marked a major turning point on the Eastern Front?","points":1500,"seconds":25,"answers":[["Stalingrad",true],["Dunkirk",false],["El Alamein",false],["Monte Cassino",false]]},
    {"prompt":"What was the Allied codename for the Normandy landings of 6 June 1944?","points":1000,"seconds":20,"answers":[["Operation Overlord",true],["Operation Dynamo",false],["Operation Husky",false],["Operation Citadel",false]]},
    {"prompt":"Which 1944 campaign liberated Paris and opened a major Western Front?","points":2000,"seconds":25,"answers":[["The Normandy campaign",true],["The North African campaign",false],["The Norwegian campaign",false],["The Burma campaign",false]]}
  ]$$::jsonb
),
(
  'ww2-home-front',
  'World War II: Home Fronts & Intelligence',
  'classroom',
  $$[
    {"prompt":"Why were ration books used in many wartime countries?","points":1000,"seconds":20,"answers":[["To distribute scarce goods fairly",true],["To recruit soldiers",false],["To record air raids",false],["To issue passports",false]]},
    {"prompt":"At which English site did Allied teams decipher many Axis communications?","points":1000,"seconds":20,"answers":[["Bletchley Park",true],["Downing Street",false],["Scapa Flow",false],["Sandhurst",false]]},
    {"prompt":"The American cultural icon Rosie the Riveter represented whom?","points":1000,"seconds":20,"answers":[["Women working in wartime industry",true],["Army nurses overseas",false],["Civilian codebreakers",false],["Radio correspondents",false]]},
    {"prompt":"What did Britain's Women's Land Army principally help to do?","points":1500,"seconds":20,"answers":[["Maintain agricultural production",true],["Build naval vessels",false],["Operate radar stations",false],["Transport diplomats",false]]},
    {"prompt":"What was the Manhattan Project created to develop?","points":1000,"seconds":20,"answers":[["The atomic bomb",true],["Long-range radar",false],["The jet engine",false],["A decoding machine",false]]},
    {"prompt":"What was a key purpose of wartime blackout regulations?","points":1500,"seconds":20,"answers":[["Make targets harder for enemy aircraft to identify",true],["Conserve coal for locomotives",false],["Prevent radio interception",false],["Hide troop uniforms",false]]}
  ]$$::jsonb
),
(
  'ww2-people-places',
  'World War II: People, Places & Diplomacy',
  'minimal',
  $$[
    {"prompt":"Who served as British prime minister for most of World War II?","points":1000,"seconds":15,"answers":[["Winston Churchill",true],["Clement Attlee",false],["Neville Chamberlain",false],["Anthony Eden",false]]},
    {"prompt":"Which American president died in office in April 1945?","points":1000,"seconds":20,"answers":[["Franklin D. Roosevelt",true],["Harry S. Truman",false],["Dwight D. Eisenhower",false],["Herbert Hoover",false]]},
    {"prompt":"Which three leaders attended the Yalta Conference in February 1945?","points":1500,"seconds":25,"answers":[["Churchill, Roosevelt and Stalin",true],["Churchill, Truman and de Gaulle",false],["Attlee, Roosevelt and Stalin",false],["Churchill, Eisenhower and Zhukov",false]]},
    {"prompt":"Which North African battle in 1942 was a major Allied victory under Bernard Montgomery?","points":1500,"seconds":20,"answers":[["Second Battle of El Alamein",true],["Battle of Tobruk",false],["Battle of Kasserine Pass",false],["Battle of Gazala",false]]},
    {"prompt":"Which city hosted the conference where the Allies issued terms for Japan in July 1945?","points":2000,"seconds":25,"answers":[["Potsdam",true],["Casablanca",false],["Tehran",false],["Quebec City",false]]},
    {"prompt":"Which international organization was founded in 1945 to promote peace and cooperation?","points":1000,"seconds":15,"answers":[["The United Nations",true],["NATO",false],["The European Union",false],["The Warsaw Pact",false]]}
  ]$$::jsonb
),
(
  'art-deco',
  'Art Deco: Glamour, Geometry & Jazz',
  'neon-arcade',
  $$[
    {"prompt":"At which 1925 event did Art Deco take its name?","points":1500,"seconds":25,"answers":[["The Paris Exposition Internationale des Arts Décoratifs",true],["The Great Exhibition in London",false],["The Venice Biennale",false],["The Chicago World's Columbian Exposition",false]]},
    {"prompt":"Which visual trait is most closely associated with Art Deco design?","points":1000,"seconds":15,"answers":[["Bold geometry and symmetry",true],["Rough medieval stonework",false],["Pastoral watercolor washes",false],["Unadorned classical columns",false]]},
    {"prompt":"Which New York skyscraper is famous for its Art Deco crown and spire?","points":1000,"seconds":20,"answers":[["The Chrysler Building",true],["The Flatiron Building",false],["The Woolworth Building",false],["One World Trade Center",false]]},
    {"prompt":"Which luxury materials commonly appeared in Art Deco interiors?","points":1500,"seconds":20,"answers":[["Lacquer, chrome and exotic woods",true],["Raw pine and burlap",false],["Adobe and thatch",false],["Wrought iron and unfinished oak only",false]]},
    {"prompt":"Tamara de Lempicka is best known for working in which field?","points":1500,"seconds":20,"answers":[["Painting",true],["Architecture",false],["Jewelry making",false],["Jazz composition",false]]},
    {"prompt":"The sleek styling of 1930s trains, cars and radios is often called what?","points":2000,"seconds":25,"answers":[["Streamline Moderne",true],["Arts and Crafts",false],["Brutalism",false],["Rococo Revival",false]]}
  ]$$::jsonb
);

CREATE TEMP TABLE seed_quizzes ON COMMIT DROP AS
SELECT overlay(
         overlay(md5(c.id::text || ':' || d.quiz_key) placing '5' from 13 for 1)
         placing '8' from 17 for 1
       )::uuid AS id,
       md5(c.id::text || ':' || d.quiz_key)::uuid AS legacy_id,
       c.id AS creator_id,
       d.quiz_key,
       d.title,
       d.theme,
       d.questions
FROM seed_creator c
CROSS JOIN seed_quiz_data d;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM live_sessions s
    JOIN seed_quizzes q ON s.quiz_id IN (q.id, q.legacy_id)
    WHERE s.state <> 'FINISHED'
  ) THEN
    RAISE EXCEPTION 'A seeded quiz has an active session; finish or cancel it before reseeding.';
  END IF;
END
$$;

-- Versions of this seed file created before UUID validation was enforced used
-- raw MD5 values. Remove only those deterministic legacy samples on rerun.
DELETE FROM quizzes q
USING seed_quizzes seeded
WHERE q.id = seeded.legacy_id
  AND q.creator_id = seeded.creator_id
  AND seeded.legacy_id <> seeded.id;

INSERT INTO quizzes (id, creator_id, title, theme)
SELECT id, creator_id, title, theme
FROM seed_quizzes
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    theme = EXCLUDED.theme,
    updated_at = now();

-- Rebuild only these deterministic sample quizzes so the file remains repeatable.
DELETE FROM questions
WHERE quiz_id IN (SELECT id FROM seed_quizzes);

WITH expanded_questions AS (
  SELECT q.id AS quiz_id,
         overlay(
           overlay(md5(q.id::text || ':question:' || (question_number - 1)::text) placing '5' from 13 for 1)
           placing '8' from 17 for 1
         )::uuid AS id,
         (question_number - 1)::integer AS position,
         question
  FROM seed_quizzes q
  CROSS JOIN LATERAL jsonb_array_elements(q.questions)
    WITH ORDINALITY AS item(question, question_number)
)
INSERT INTO questions (id, quiz_id, position, prompt, points, time_limit_seconds)
SELECT id,
       quiz_id,
       position,
       question->>'prompt',
       (question->>'points')::integer,
       (question->>'seconds')::integer
FROM expanded_questions;

WITH expanded_questions AS (
  SELECT q.id AS quiz_id,
         overlay(
           overlay(md5(q.id::text || ':question:' || (question_number - 1)::text) placing '5' from 13 for 1)
           placing '8' from 17 for 1
         )::uuid AS question_id,
         question
  FROM seed_quizzes q
  CROSS JOIN LATERAL jsonb_array_elements(q.questions)
    WITH ORDINALITY AS item(question, question_number)
),
expanded_answers AS (
  SELECT question_id,
         answer,
         (answer_number - 1)::integer AS position
  FROM expanded_questions
  CROSS JOIN LATERAL jsonb_array_elements(question->'answers')
    WITH ORDINALITY AS item(answer, answer_number)
)
INSERT INTO answer_options (id, question_id, position, text, is_correct)
SELECT overlay(
         overlay(md5(question_id::text || ':answer:' || position::text) placing '5' from 13 for 1)
         placing '8' from 17 for 1
       )::uuid,
       question_id,
       position,
       answer->>0,
       (answer->>1)::boolean
FROM expanded_answers;

COMMIT;

\echo 'Seeded 4 quizzes (24 questions) for' :creator_email
