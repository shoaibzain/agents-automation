import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, day TEXT UNIQUE NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, source TEXT, imported INTEGER NOT NULL DEFAULT 0, error TEXT);
    CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, category TEXT, seller TEXT, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS snapshots (product_id TEXT NOT NULL, day TEXT NOT NULL, captured_at TEXT NOT NULL, price REAL, sold_count INTEGER, review_count INTEGER, rating REAL, availability TEXT, source TEXT NOT NULL, PRIMARY KEY(product_id, day), FOREIGN KEY(product_id) REFERENCES products(id));
    CREATE INDEX IF NOT EXISTS snapshots_day ON snapshots(day);
    CREATE TABLE IF NOT EXISTS watchlist (product_id TEXT PRIMARY KEY, added_at TEXT NOT NULL, last_attempt_at TEXT, last_checked_at TEXT, sku_id TEXT, last_error TEXT);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  if(!db.prepare('PRAGMA table_info(snapshots)').all().some(c=>c.name==='price_basis'))db.exec("ALTER TABLE snapshots ADD COLUMN price_basis TEXT NOT NULL DEFAULT 'search_listing'");
  return db;
}
