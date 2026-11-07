import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
// seed -> ledger -> db is a cycle, but only function bodies use the bindings.
import { ensureSeeded } from "@/lib/seed";

type DB = Database.Database;

const globalForDb = globalThis as unknown as { __irDb?: DB; __irSeeded?: boolean };

function migrationsDir(): string {
  return path.join(process.cwd(), "db", "migrations");
}

export function migrate(db: DB): void {
  const files = fs
    .readdirSync(migrationsDir())
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    db.exec(fs.readFileSync(path.join(migrationsDir(), f), "utf8"));
  }
}

function open(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

/** Raw connection, migrated but not seeded. */
export function rawDb(): DB {
  if (!globalForDb.__irDb) globalForDb.__irDb = open(env.databasePath);
  return globalForDb.__irDb;
}

/** Migrated and seeded connection. Seeding is idempotent and deterministic. */
export function getDb(): DB {
  const db = rawDb();
  if (!globalForDb.__irSeeded) {
    globalForDb.__irSeeded = true;
    ensureSeeded(db);
  }
  return db;
}

/** Called by the seeder so its own getDb() calls do not re-enter seeding. */
export function markSeeded(): void {
  globalForDb.__irSeeded = true;
}

/** Test helper: replace the singleton with a fresh in-memory database. */
export function resetTestDb(seed = true): DB {
  globalForDb.__irDb?.close();
  globalForDb.__irDb = open(":memory:");
  globalForDb.__irSeeded = !seed;
  return seed ? getDb() : globalForDb.__irDb;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export const bool = (v: unknown): boolean => v === 1 || v === true;
