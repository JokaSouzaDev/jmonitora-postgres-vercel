BEGIN;

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('MONITOR', 'PROFESSOR', 'ADMIN')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_users_email_lowercase CHECK (email = LOWER(email))
);

CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_unique ON app_users (LOWER(email));

CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY,
  ra VARCHAR(40) NOT NULL,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(254),
  course VARCHAR(160) NOT NULL,
  semester INTEGER NOT NULL CHECK (semester > 0 AND semester <= 20),
  phone VARCHAR(30),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS students_ra_unique ON students (LOWER(ra));
CREATE UNIQUE INDEX IF NOT EXISTS students_email_unique
  ON students (LOWER(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  author_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  observation VARCHAR(2000) NOT NULL CHECK (CHAR_LENGTH(TRIM(observation)) BETWEEN 10 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reports_student_created_idx
  ON reports (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_author_idx ON reports (author_id);

COMMIT;
