import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

const configuredPath = process.env.SQLITE_DB_PATH ?? "data/veterinary-clinic.sqlite";
const databasePath = path.resolve(process.cwd(), configuredPath);
mkdirSync(path.dirname(databasePath), { recursive: true });

export const database = new DatabaseSync(databasePath);

database.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    species TEXT NOT NULL CHECK (length(trim(species)) > 0),
    breed TEXT NOT NULL DEFAULT '',
    age INTEGER NOT NULL CHECK (age >= 0),
    sex TEXT NOT NULL CHECK (sex IN ('female', 'male')),
    owner_name TEXT NOT NULL CHECK (length(trim(owner_name)) > 0),
    owner_phone TEXT NOT NULL CHECK (length(trim(owner_phone)) > 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    visit_date TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    diagnosis TEXT NOT NULL DEFAULT '',
    treatment TEXT NOT NULL DEFAULT '',
    observations TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS visits_patient_date_idx
    ON visits(patient_id, visit_date DESC, id DESC);
  CREATE INDEX IF NOT EXISTS visits_date_idx
    ON visits(visit_date DESC, id DESC);

  -- A pet can have several owners and an owner can have several pets.
  -- patients.owner_name/owner_phone keep the first owner for API compatibility.
  CREATE TABLE IF NOT EXISTS owners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    phone TEXT NOT NULL CHECK (length(trim(phone)) > 0),
    name_key TEXT NOT NULL,
    phone_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (name_key, phone_key)
  );

  CREATE TABLE IF NOT EXISTS patient_owners (
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    owner_id INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (patient_id, owner_id)
  );
  CREATE INDEX IF NOT EXISTS patient_owners_owner_idx
    ON patient_owners(owner_id);

  -- Visits used to store only a UTC date; keep those days as midday on the clinic's clock.
  UPDATE visits
     SET visit_date = visit_date || 'T17:00:00.000Z'
   WHERE length(visit_date) = 10;
`);

export type OwnerRow = {
  id: number;
  name: string;
  phone: string;
};

export type PatientRow = {
  id: number;
  name: string;
  species: string;
  breed: string;
  age: number;
  sex: "female" | "male";
  ownerName: string;
  ownerPhone: string;
  createdAt: string;
};

export type PatientWithOwners = PatientRow & { owners: OwnerRow[] };

export type VisitRow = {
  id: number;
  patientId: number;
  patientName: string;
  patientSpecies: string;
  visitDate: string;
  reason: string;
  diagnosis: string;
  treatment: string;
  observations: string;
  createdAt: string;
};

export type VisitWithOwners = VisitRow & { ownerNames: string };

export type RecentVisitRow = Pick<
  VisitRow,
  "id" | "patientId" | "patientName" | "patientSpecies" | "visitDate" | "reason"
>;

export function queryAll<T>(
  sql: string,
  ...parameters: SQLInputValue[]
): T[] {
  return database.prepare(sql).all(...parameters) as T[];
}

export function queryOne<T>(
  sql: string,
  ...parameters: SQLInputValue[]
): T | undefined {
  return database.prepare(sql).get(...parameters) as T | undefined;
}

export function execute(
  sql: string,
  ...parameters: SQLInputValue[]
): number {
  const result = database.prepare(sql).run(...parameters);
  return Number(result.changes);
}

export function insert(
  sql: string,
  ...parameters: SQLInputValue[]
): number {
  const result = database.prepare(sql).run(...parameters);
  return Number(result.lastInsertRowid);
}

export function transaction<T>(work: () => T): T {
  database.exec("BEGIN");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
