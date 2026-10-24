import { DatabaseSync } from "node:sqlite";

/**
 * The one SQLite file per deployment (ADR 0002). Fields are SPEC.md §6.
 * Every writable table has a version. Only the write path changes these tables.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS actor (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('human', 'agent')),
  display_name TEXT NOT NULL,
  operator TEXT REFERENCES actor(id),
  email TEXT,
  subject TEXT UNIQUE,
  app_id TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS org_unit (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  level TEXT NOT NULL,
  parent TEXT REFERENCES org_unit(id),
  owner TEXT NOT NULL REFERENCES actor(id)
);
CREATE TABLE IF NOT EXISTS priority (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  org_unit TEXT NOT NULL REFERENCES org_unit(id),
  period TEXT NOT NULL,
  rank INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  cut_line INTEGER CHECK (cut_line IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('Current', 'Retired'))
);
CREATE TABLE IF NOT EXISTS doc (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS goal (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  owner TEXT NOT NULL REFERENCES actor(id),
  org_unit TEXT NOT NULL REFERENCES org_unit(id),
  level TEXT NOT NULL,
  type TEXT NOT NULL,
  due_date TEXT,
  date_type TEXT,
  promotion_milestone TEXT REFERENCES goal(id),
  plan TEXT,
  committed_plan_version INTEGER,
  plan_maturity TEXT NOT NULL CHECK (plan_maturity IN ('Watercolor', 'Crayon', 'Pencil')),
  work_product TEXT,
  original_committed_date TEXT,
  changed_due_date TEXT,
  severity TEXT NOT NULL,
  priority TEXT REFERENCES priority(id),
  state TEXT NOT NULL CHECK (state IN ('Backlog', 'In Progress', 'Completed', 'Completed Late', 'Did Not Meet', 'Deleted')),
  health TEXT CHECK (health IN ('GREEN', 'YELLOW', 'RED')),
  path_to_green TEXT,
  origination TEXT NOT NULL CHECK (origination IN ('New', 'Carryover', 'Repeating')),
  parent TEXT REFERENCES goal(id),
  visibility TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS work_item (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  goal TEXT NOT NULL REFERENCES goal(id),
  title TEXT NOT NULL,
  owner TEXT NOT NULL REFERENCES actor(id),
  status TEXT NOT NULL,
  due_date TEXT,
  links TEXT
);
CREATE TABLE IF NOT EXISTS draft (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  entity TEXT NOT NULL,
  actor TEXT NOT NULL REFERENCES actor(id),
  base_version INTEGER NOT NULL,
  change TEXT NOT NULL,
  reason TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS owner_settings (
  id TEXT PRIMARY KEY CHECK (id = 'owner'),
  version INTEGER NOT NULL,
  owner TEXT NOT NULL REFERENCES actor(id),
  settings TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_settings (
  id TEXT PRIMARY KEY REFERENCES actor(id),
  version INTEGER NOT NULL,
  favorite_views TEXT NOT NULL,
  appearance TEXT NOT NULL CHECK (appearance IN ('light', 'dark'))
);
CREATE TABLE IF NOT EXISTS event (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  actor TEXT NOT NULL REFERENCES actor(id),
  entity_kind TEXT NOT NULL,
  entity TEXT NOT NULL,
  field TEXT NOT NULL,
  old TEXT,
  new TEXT,
  reason TEXT
);
-- One goal's Events, in order, without a scan of the log (review E21).
CREATE INDEX IF NOT EXISTS event_by_entity ON event (entity_kind, entity, sequence);
CREATE TRIGGER IF NOT EXISTS event_no_update BEFORE UPDATE ON event
BEGIN SELECT RAISE(ABORT, 'the Event log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS event_no_delete BEFORE DELETE ON event
BEGIN SELECT RAISE(ABORT, 'the Event log is append-only'); END;
`;

/** Open the deployment's file, create it if missing, and apply the schema. */
export function openStore(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}
