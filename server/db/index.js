import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Opens (and migrates) a SQLite database. Uses Node's built-in sqlite so there
 * are no native modules to compile when the system is moved between businesses.
 */
export function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  return wrap(db);
}

// Thin helpers so call-sites stay short and JSON columns are handled in one place.
function wrap(db) {
  return {
    raw: db,
    get: (sql, ...params) => db.prepare(sql).get(...params),
    all: (sql, ...params) => db.prepare(sql).all(...params),
    run: (sql, ...params) => db.prepare(sql).run(...params),
    exec: (sql) => db.exec(sql),
    tx(fn) {
      db.exec('BEGIN');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    insert(table, row) {
      const cols = Object.keys(row);
      const values = cols.map((c) => toSql(row[c]));
      db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...values);
      return row;
    },
    update(table, id, patch, idCol = 'id') {
      const cols = Object.keys(patch);
      if (!cols.length) return;
      db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE ${idCol} = ?`)
        .run(...cols.map((c) => toSql(patch[c])), id);
    },
  };
}

function toSql(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return value;
}

/** Parses the named JSON columns on a row (or array of rows). */
export function parseJson(rows, ...cols) {
  const one = (row) => {
    if (!row) return row;
    for (const c of cols) {
      if (typeof row[c] === 'string') {
        try { row[c] = JSON.parse(row[c]); } catch { /* leave as text */ }
      }
    }
    return { ...row };
  };
  return Array.isArray(rows) ? rows.map(one) : one(rows);
}
