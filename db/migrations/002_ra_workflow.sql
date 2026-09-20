-- Transactional migration. Preserve every existing student, report and account.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM students GROUP BY UPPER(TRIM(ra)) HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'RAs duplicados após normalização. Corrija antes de migrar.';
  END IF;
END $$;
UPDATE students SET ra = UPPER(TRIM(ra));
ALTER TABLE students ADD CONSTRAINT students_ra_format CHECK (ra ~ '^[A-Z0-9][A-Z0-9.-]{0,39}$');
ALTER TABLE students ADD COLUMN class_name VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE students ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE reports DROP CONSTRAINT reports_student_id_fkey;
ALTER TABLE students DROP CONSTRAINT students_pkey;
ALTER TABLE students ADD CONSTRAINT students_pkey PRIMARY KEY (ra);
ALTER TABLE students ADD CONSTRAINT students_legacy_id_unique UNIQUE (id);
ALTER TABLE students ADD CONSTRAINT students_id_ra_unique UNIQUE (id, ra);
ALTER TABLE reports ADD COLUMN student_ra VARCHAR(40);
UPDATE reports r SET student_ra = s.ra FROM students s WHERE s.id = r.student_id;
ALTER TABLE reports ALTER COLUMN student_ra SET NOT NULL;
ALTER TABLE reports ADD CONSTRAINT reports_student_fk FOREIGN KEY (student_id, student_ra)
  REFERENCES students(id, ra) ON UPDATE CASCADE ON DELETE RESTRICT;
-- Old clients can still insert a report using student_id during a rolling deploy.
CREATE FUNCTION resolve_report_student() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.student_ra IS NULL THEN SELECT ra INTO NEW.student_ra FROM students WHERE id = NEW.student_id; END IF;
  IF NEW.student_id IS NULL THEN SELECT id INTO NEW.student_id FROM students WHERE ra = NEW.student_ra; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reports_resolve_student BEFORE INSERT ON reports FOR EACH ROW EXECUTE FUNCTION resolve_report_student();
ALTER TABLE app_users ADD COLUMN ra VARCHAR(40) REFERENCES students(ra) ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE UNIQUE INDEX app_users_ra_unique ON app_users(ra) WHERE ra IS NOT NULL;
ALTER TABLE app_users ADD COLUMN approval_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED'
  CHECK (approval_status IN ('PENDING','APPROVED','REJECTED'));
ALTER TABLE app_users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE app_users ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE app_users ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE app_users ADD CONSTRAINT pending_users_inactive CHECK (approval_status = 'APPROVED' OR active = FALSE);
ALTER TABLE reports ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'NEW'
  CHECK (status IN ('NEW','IN_REVIEW','RESOLVED'));
ALTER TABLE reports ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE reports ADD COLUMN request_key UUID;
CREATE UNIQUE INDEX reports_request_unique ON reports(author_id, request_key) WHERE request_key IS NOT NULL;
CREATE TABLE report_events (
  id UUID PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE RESTRICT,
  actor_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL CHECK (status IN ('NEW','IN_REVIEW','RESOLVED')),
  note VARCHAR(2000) NOT NULL CHECK (CHAR_LENGTH(TRIM(note)) BETWEEN 3 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  actor_id UUID REFERENCES app_users(id) ON DELETE RESTRICT,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(30) NOT NULL,
  entity_key VARCHAR(100) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE auth_attempts (
  key_hash VARCHAR(64) PRIMARY KEY,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX auth_attempts_expiry_idx ON auth_attempts(expires_at);
CREATE INDEX students_active_name_idx ON students(active, name, ra);
CREATE INDEX reports_ra_created_idx ON reports(student_ra, created_at DESC, id DESC);
CREATE INDEX reports_status_created_idx ON reports(status, created_at DESC, id DESC);
CREATE INDEX reports_author_created_idx ON reports(author_id, created_at DESC, id DESC);
CREATE INDEX reports_created_idx ON reports(created_at DESC, id DESC);
CREATE INDEX report_events_report_idx ON report_events(report_id, created_at, id);
CREATE INDEX audit_entity_idx ON audit_log(entity_type, entity_key, created_at DESC);
CREATE INDEX app_users_approval_idx ON app_users(approval_status, name, id);
