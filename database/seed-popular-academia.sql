-- Launch content for Quizzy's public library.
-- Run once against the configured database:
--   psql "$DATABASE_URL" -f database/seed-popular-academia.sql
--
-- The rows deliberately use the normal creators, quizzes, questions and
-- answer_options tables. The demo creator accounts are public identities only
-- (their password value is not a login credential).

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO creators (id, email, password_hash) VALUES
  ('11111111-1111-4111-8111-111111111101', 'e.martin@northbridge.edu', 'launch-seed-account'),
  ('11111111-1111-4111-8111-111111111102', 'j.keller@westhaven.edu', 'launch-seed-account'),
  ('11111111-1111-4111-8111-111111111103', 'entropy.owl@lakeside.edu', 'launch-seed-account'),
  ('11111111-1111-4111-8111-111111111104', 'l.moreau@montrose.edu', 'launch-seed-account'),
  ('11111111-1111-4111-8111-111111111105', 'cosmic.quokka@riverton.edu', 'launch-seed-account')
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    password_hash = EXCLUDED.password_hash;

CREATE TEMP TABLE popular_quiz_data (
  quiz_id uuid PRIMARY KEY,
  creator_id uuid NOT NULL,
  title text NOT NULL,
  theme text NOT NULL,
  play_count integer NOT NULL,
  questions jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO popular_quiz_data (quiz_id, creator_id, title, theme, play_count, questions) VALUES
(
  '21111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111101',
  'Calculus: Limits, Series & Change', 'classroom', 156,
  $quizjson$[
    {"prompt":"Which limit defines the derivative of f at x?","points":1000,"seconds":25,"answers":[["$$\\lim_{h\\to 0}\\frac{f(x+h)-f(x)}{h}$$",true],["$$\\lim_{h\\to 1} f(x+h)$$",false],["$$\\int f(x)\\,dx$$",false],["$$f(x)^2$$",false]]},
    {"prompt":"What is the radius of convergence of $$\\sum_{n=0}^{\\infty}\\frac{x^n}{n!}$$?","points":1200,"seconds":25,"answers":[["$$\\infty$$",true],["$$1$$",false],["$$0$$",false],["It has no limit",false]]},
    {"prompt":"Which theorem guarantees a maximum for a continuous function on a closed interval?","points":1000,"seconds":20,"answers":[["Extreme Value Theorem",true],["Intermediate Value Theorem",false],["Green's theorem",false],["Fubini's theorem",false]]}
  ]$quizjson$::jsonb
),
(
  '21111111-1111-4111-8111-111111111102', '11111111-1111-4111-8111-111111111102',
  'Linear Algebra: Eigenvalues in Motion', 'minimal', 142,
  $quizjson$[
    {"prompt":"For which scalar $$\\lambda$$ does a non-zero vector satisfy $$A\\mathbf v=\\lambda\\mathbf v$$?","points":1100,"seconds":25,"answers":[["An eigenvalue of A",true],["The determinant of A",false],["The trace of A only",false],["A singular value only",false]]},
    {"prompt":"What is the determinant of a triangular matrix?","points":900,"seconds":20,"answers":[["The product of its diagonal entries",true],["The sum of its rows",false],["Always zero",false],["Its largest eigenvalue",false]]},
    {"prompt":"A real symmetric matrix can always be diagonalized by which kind of matrix?","points":1300,"seconds":25,"answers":[["An orthogonal matrix",true],["A nilpotent matrix",false],["A permutation only",false],["A complex skew matrix",false]]}
  ]$quizjson$::jsonb
),
(
  '21111111-1111-4111-8111-111111111103', '11111111-1111-4111-8111-111111111103',
  'Probability: Bayes, Randomness & Inference', 'game-show', 129,
  $quizjson$[
    {"prompt":"Bayes' theorem updates a prior using which quantity?","points":1000,"seconds":20,"answers":[["The likelihood of the observed evidence",true],["The sample size alone",false],["The variance only",false],["A random seed",false]]},
    {"prompt":"If X and Y are independent, which identity holds?","points":1100,"seconds":20,"answers":[["$$P(X\\cap Y)=P(X)P(Y)$$",true],["$$P(X\\cap Y)=P(X)+P(Y)$$",false],["$$P(X|Y)=0$$",false],["$$E[XY]=E[X]+E[Y]$$",false]]},
    {"prompt":"For a fair six-sided die, what is $$E[X]$$?","points":900,"seconds":15,"answers":[["$$3.5$$",true],["$$3$$",false],["$$6$$",false],["$$\\sqrt 6$$",false]]}
  ]$quizjson$::jsonb
),
(
  '21111111-1111-4111-8111-111111111104', '11111111-1111-4111-8111-111111111104',
  'Real Analysis: Continuity & the Riemann Integral', 'classroom', 116,
  $quizjson$[
    {"prompt":"Which epsilon-delta statement describes continuity at a?","points":1200,"seconds":25,"answers":[["For every $$\\varepsilon>0$$ there is $$\\delta>0$$ such that $$|x-a|<\\delta\\Rightarrow|f(x)-f(a)|<\\varepsilon$$",true],["For every x, f(x)=0",false],["There is one universal delta",false],["The derivative must be constant",false]]},
    {"prompt":"Every continuous function on a compact interval is what?","points":1000,"seconds":20,"answers":[["Uniformly continuous and bounded",true],["Always differentiable",false],["Periodic",false],["Linear",false]]},
    {"prompt":"Which criterion characterizes Riemann integrability for a bounded function?","points":1300,"seconds":25,"answers":[["Its upper and lower sums can be made arbitrarily close",true],["It must be analytic",false],["It must have a Fourier series",false],["It must be monotone",false]]}
  ]$quizjson$::jsonb
),
(
  '21111111-1111-4111-8111-111111111105', '11111111-1111-4111-8111-111111111105',
  'Number Theory: Congruences & RSA', 'neon-arcade', 103,
  $quizjson$[
    {"prompt":"What does $$a\\equiv b\\pmod n$$ mean?","points":900,"seconds":20,"answers":[["n divides $$a-b$$",true],["a divides n",false],["a and b are equal as integers",false],["n is prime",false]]},
    {"prompt":"In RSA, which operation creates the public key from two secret primes?","points":1200,"seconds":25,"answers":[["Compute $$n=pq$$ and choose a public exponent",true],["Add p and q",false],["Square each prime",false],["Take the inverse of p only",false]]},
    {"prompt":"Which statement is Fermat's little theorem for prime p and p∤a?","points":1300,"seconds":25,"answers":[["$$a^{p-1}\\equiv1\\pmod p$$",true],["$$a^p\\equiv0\\pmod p$$",false],["$$p^{a-1}\\equiv1\\pmod a$$",false],["$$a+p\\equiv1\\pmod p$$",false]]}
  ]$quizjson$::jsonb
),
(
  '21111111-1111-4111-8111-111111111106', '11111111-1111-4111-8111-111111111103',
  'Classical Mechanics: Lagrangians & Orbits', 'game-show', 91,
  $quizjson$[
    {"prompt":"In Lagrangian mechanics, the equations of motion come from extremizing what?","points":1000,"seconds":20,"answers":[["The action $$S=\\int L\\,dt$$",true],["The kinetic energy alone",false],["The momentum vector",false],["The phase angle",false]]},
    {"prompt":"For a central force, which vector is conserved?","points":1100,"seconds":20,"answers":[["Angular momentum",true],["Position",false],["Speed in every frame",false],["Potential energy",false]]},
    {"prompt":"For a circular orbit in Newtonian gravity, how does speed scale with radius?","points":1200,"seconds":25,"answers":[["$$v\\propto r^{-1/2}$$",true],["$$v\\propto r$$",false],["$$v\\propto r^2$$",false],["It is independent of r",false]]}
  ]$quizjson$::jsonb
),
(
  '21111111-1111-4111-8111-111111111107', '11111111-1111-4111-8111-111111111104',
  'Electromagnetism: Fields & Maxwell', 'minimal', 78,
  $quizjson$[
    {"prompt":"Which equation expresses that magnetic monopoles have not been observed?","points":1000,"seconds":20,"answers":[["$$\\nabla\\cdot\\mathbf B=0$$",true],["$$\\nabla\\times\\mathbf B=0$$",false],["$$\\nabla\\cdot\\mathbf E=0$$",false],["$$\\partial_t\\mathbf B=0$$",false]]},
    {"prompt":"Faraday's law says a changing magnetic flux produces what?","points":1000,"seconds":20,"answers":[["An induced electromotive force",true],["A static charge",false],["A gravitational wave",false],["A conserved magnetic charge",false]]},
    {"prompt":"In vacuum, the speed of an electromagnetic wave is $$c$$. Which relation is correct?","points":1200,"seconds":25,"answers":[["$$c=1/\\sqrt{\\mu_0\\varepsilon_0}$$",true],["$$c=\\mu_0\\varepsilon_0$$",false],["$$c=\\mu_0+\\varepsilon_0$$",false],["$$c=\\sqrt{\\mu_0/\\varepsilon_0}$$",false]]}
  ]$quizjson$::jsonb
),
(
  '21111111-1111-4111-8111-111111111108', '11111111-1111-4111-8111-111111111105',
  'Quantum Mechanics: States & Operators', 'neon-arcade', 64,
  $quizjson$[
    {"prompt":"What does the absolute square $$|\\psi(x)|^2$$ represent?","points":1000,"seconds":20,"answers":[["The probability density",true],["The energy density always",false],["The wavefunction phase",false],["The particle's velocity",false]]},
    {"prompt":"Which equation governs the time evolution of a non-relativistic quantum state?","points":1100,"seconds":25,"answers":[["$$i\\hbar\\frac{\\partial\\psi}{\\partial t}=\\hat H\\psi$$",true],["$$E=mc^2$$",false],["$$F=ma$$",false],["$$\\nabla\\cdot E=\\rho$$",false]]},
    {"prompt":"If two observables have a non-zero commutator, what follows?","points":1300,"seconds":25,"answers":[["They cannot generally have simultaneous sharp values",true],["They are identical",false],["Both are always conserved",false],["Their eigenvalues are continuous",false]]}
  ]$quizjson$::jsonb
),
(
  '21111111-1111-4111-8111-111111111109', '11111111-1111-4111-8111-111111111101',
  'Thermodynamics: Entropy & Ensembles', 'classroom', 49,
  $quizjson$[
    {"prompt":"For a reversible process, how is entropy change related to heat?","points":1000,"seconds":20,"answers":[["$$dS=\\delta Q_{\\mathrm{rev}}/T$$",true],["$$dS=T\\delta Q$$",false],["$$dS=0$$ for every process",false],["$$dS=\\delta Q/T^2$$",false]]},
    {"prompt":"The second law says the entropy of an isolated system cannot what?","points":900,"seconds":15,"answers":[["Decrease",true],["Increase",false],["Be measured",false],["Depend on temperature",false]]},
    {"prompt":"In the canonical ensemble, which variable is held fixed with particle number?","points":1200,"seconds":20,"answers":[["Temperature and volume",true],["Pressure and entropy",false],["Chemical potential only",false],["Energy and pressure",false]]}
  ]$quizjson$::jsonb
),
(
  '21111111-1111-4111-8111-111111111110', '11111111-1111-4111-8111-111111111102',
  'Relativity: Spacetime & Energy', 'game-show', 35,
  $quizjson$[
    {"prompt":"What does special relativity require all inertial observers to measure identically?","points":1000,"seconds":20,"answers":[["The speed of light in vacuum",true],["Their elapsed time",false],["Their measured length",false],["Their kinetic energy",false]]},
    {"prompt":"The Lorentz factor is $$\\gamma=1/\\sqrt{1-v^2/c^2}$$. What happens as v approaches c?","points":1200,"seconds":25,"answers":[["It grows without bound",true],["It approaches zero",false],["It stays equal to one",false],["It becomes imaginary for all v",false]]},
    {"prompt":"Which relation connects a particle's total energy, momentum and rest mass?","points":1300,"seconds":25,"answers":[["$$E^2=p^2c^2+m^2c^4$$",true],["$$E=pc+m c^2$$",false],["$$E=p^2/2m$$",false],["$$E=mc$$",false]]}
  ]$quizjson$::jsonb
);

-- Keep the launch library varied: short quizzes, standard sets, and deeper runs.
UPDATE popular_quiz_data
SET questions = questions - 2
WHERE quiz_id IN (
  '21111111-1111-4111-8111-111111111102',
  '21111111-1111-4111-8111-111111111106',
  '21111111-1111-4111-8111-111111111110'
);

UPDATE popular_quiz_data
SET questions = questions || $quizjson$[
  {"prompt":"Which test can prove a series converges absolutely?","points":1100,"seconds":20,"answers":[["The comparison test applied to $$\\sum |a_n|$$",true],["The intermediate value theorem",false],["A determinant test",false],["The rank-nullity theorem",false]]}
]$quizjson$::jsonb
WHERE quiz_id IN (
  '21111111-1111-4111-8111-111111111101',
  '21111111-1111-4111-8111-111111111105',
  '21111111-1111-4111-8111-111111111109'
);

UPDATE popular_quiz_data
SET questions = questions || $quizjson$[
  {"prompt":"If events A and B are mutually exclusive, what is $$P(A\\cap B)$$?","points":1000,"seconds":20,"answers":[["$$0$$",true],["$$1$$",false],["$$P(A)P(B)$$",false],["$$P(A)+P(B)$$",false]]},
  {"prompt":"What does the central limit theorem describe as sample size grows?","points":1200,"seconds":25,"answers":[["The sampling mean approaches a normal distribution",true],["Every observation becomes identical",false],["The variance always becomes zero",false],["The population must become finite",false]]}
]$quizjson$::jsonb
WHERE quiz_id IN (
  '21111111-1111-4111-8111-111111111103',
  '21111111-1111-4111-8111-111111111107'
);

-- Put history and biology into the visible top ranks as well.
UPDATE popular_quiz_data
SET title = 'World War II: Turning Points & Strategy',
    theme = 'classroom',
    questions = $quizjson$[
      {"prompt":"Which event is generally regarded as the beginning of World War II in Europe?","points":1000,"seconds":20,"answers":[["Germany's invasion of Poland in 1939",true],["The attack on Pearl Harbor",false],["The fall of France",false],["The Munich Agreement",false]]},
      {"prompt":"What was the strategic significance of the Battle of Stalingrad?","points":1200,"seconds":25,"answers":[["It marked a major turning point against Nazi Germany on the Eastern Front",true],["It ended the war in the Pacific",false],["It created the United Nations",false],["It began the invasion of Poland",false]]},
      {"prompt":"Which 1944 operation opened a major Allied front in Western Europe?","points":1100,"seconds":20,"answers":[["Operation Overlord",true],["Operation Barbarossa",false],["Operation Torch",false],["Operation Market Garden",false]]},
      {"prompt":"The Manhattan Project developed which weapon?","points":1000,"seconds":20,"answers":[["The atomic bomb",true],["The first radar network",false],["A jet airliner",false],["A satellite",false]]},
      {"prompt":"Which document established the post-war principle of self-determination for peoples?","points":1300,"seconds":25,"answers":[["The Atlantic Charter",true],["The Treaty of Versailles",false],["The Yalta Protocol",false],["The Geneva Convention",false]]}
    ]$quizjson$::jsonb
WHERE quiz_id = '21111111-1111-4111-8111-111111111103';

UPDATE popular_quiz_data
SET title = 'Cell Biology: Genes & Systems',
    theme = 'minimal',
    questions = $quizjson$[
      {"prompt":"Which organelle is primarily responsible for ATP production in eukaryotic cells?","points":1000,"seconds":20,"answers":[["The mitochondrion",true],["The ribosome",false],["The lysosome",false],["The Golgi apparatus",false]]},
      {"prompt":"During which phase of the cell cycle is DNA replicated?","points":1100,"seconds":20,"answers":[["S phase",true],["G1 phase",false],["G2 phase",false],["M phase",false]]},
      {"prompt":"What type of bond holds complementary DNA bases together?","points":900,"seconds":15,"answers":[["Hydrogen bonds",true],["Peptide bonds",false],["Ionic bonds",false],["Disulfide bonds",false]]}
    ]$quizjson$::jsonb
WHERE quiz_id = '21111111-1111-4111-8111-111111111104';

UPDATE popular_quiz_data
SET title = 'Molecular Biology: DNA & Evolution',
    theme = 'neon-arcade',
    questions = $quizjson$[
      {"prompt":"Which enzyme synthesizes a new DNA strand during replication?","points":1000,"seconds":20,"answers":[["DNA polymerase",true],["RNA ligase",false],["ATP synthase",false],["Pepsin",false]]},
      {"prompt":"What is the usual flow of genetic information in a cell?","points":1100,"seconds":25,"answers":[["DNA to RNA to protein",true],["Protein to RNA to DNA",false],["RNA to protein to DNA",false],["DNA to protein to RNA",false]]},
      {"prompt":"Natural selection acts directly on which level?","points":1200,"seconds":25,"answers":[["Phenotypic variation in populations",true],["Individual intentions",false],["Unchanging traits",false],["A species' fossil record only",false]]}
    ]$quizjson$::jsonb
WHERE quiz_id = '21111111-1111-4111-8111-111111111108';

UPDATE popular_quiz_data
SET title = 'Modern History: Revolutions & Institutions',
    theme = 'game-show',
    questions = $quizjson$[
      {"prompt":"Which political document begins with the claim that all men are created equal?","points":1000,"seconds":20,"answers":[["The United States Declaration of Independence",true],["The Magna Carta",false],["The Napoleonic Code",false],["The Communist Manifesto",false]]},
      {"prompt":"The Industrial Revolution first took hold in which country?","points":900,"seconds":15,"answers":[["Great Britain",true],["Japan",false],["Brazil",false],["Egypt",false]]}
    ]$quizjson$::jsonb
WHERE quiz_id = '21111111-1111-4111-8111-111111111110';

-- Remove any old live or completed sessions for this deterministic launch set
-- before rebuilding its questions (question_rounds retain RESTRICT references).
DELETE FROM live_sessions
WHERE quiz_id IN (SELECT quiz_id FROM popular_quiz_data);

INSERT INTO quizzes (id, creator_id, title, theme, is_public, play_count)
SELECT quiz_id, creator_id, title, theme, true, play_count
FROM popular_quiz_data
ON CONFLICT (id) DO UPDATE
SET creator_id = EXCLUDED.creator_id,
    title = EXCLUDED.title,
    theme = EXCLUDED.theme,
    is_public = true,
    play_count = EXCLUDED.play_count,
    updated_at = now();

DELETE FROM questions
WHERE quiz_id IN (SELECT quiz_id FROM popular_quiz_data);

WITH expanded_questions AS (
  SELECT q.quiz_id,
         overlay(
           overlay(md5(q.quiz_id::text || ':question:' || (item.ordinality - 1)::text) placing '4' from 13 for 1)
           placing '8' from 17 for 1
         )::uuid AS question_id,
         (item.ordinality - 1)::integer AS position,
         item.question
  FROM popular_quiz_data q
  CROSS JOIN LATERAL jsonb_array_elements(q.questions) WITH ORDINALITY AS item(question, ordinality)
)
INSERT INTO questions (id, quiz_id, position, prompt, points, time_limit_seconds)
SELECT question_id,
       quiz_id,
       position,
       question->>'prompt',
       (question->>'points')::integer,
       (question->>'seconds')::integer
FROM expanded_questions;

WITH expanded_questions AS (
  SELECT q.quiz_id,
         overlay(
           overlay(md5(q.quiz_id::text || ':question:' || (item.ordinality - 1)::text) placing '4' from 13 for 1)
           placing '8' from 17 for 1
         )::uuid AS question_id,
         (item.ordinality - 1)::integer AS question_position,
         item.question
  FROM popular_quiz_data q
  CROSS JOIN LATERAL jsonb_array_elements(q.questions) WITH ORDINALITY AS item(question, ordinality)
), expanded_answers AS (
  SELECT question_id,
         answer,
         (((item.ordinality - 1) + question_position + 1) % 4)::integer AS position
  FROM expanded_questions
  CROSS JOIN LATERAL jsonb_array_elements(question->'answers') WITH ORDINALITY AS item(answer, ordinality)
)
INSERT INTO answer_options (id, question_id, position, text, is_correct)
SELECT overlay(
         overlay(md5(question_id::text || ':answer:' || position::text) placing '4' from 13 for 1)
         placing '8' from 17 for 1
       )::uuid,
       question_id,
       position,
       answer->>0,
       (answer->>1)::boolean
FROM expanded_answers;

COMMIT;

\echo 'Seeded 10 public academic quizzes with play counts from 156 down to 35.'
