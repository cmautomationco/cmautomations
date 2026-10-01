// Browser stand-in for node:sqlite, backed by SQLite compiled to JavaScript (sql.js).
let current = null;

/** The boot script hands over the sql.js database (fresh or restored from storage). */
export function setSqlDatabase(sqlDb) { current = sqlDb; }
export function getSqlDatabase() { return current; }

const toSql = (v) => {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
};

export class DatabaseSync {
  constructor() {
    if (!current) throw new Error('SQLite is not ready yet');
    this.db = current;
  }

  exec(sql) { this.db.exec(sql); }

  prepare(sql) {
    const db = this.db;
    const withStmt = (params, fn) => {
      const stmt = db.prepare(sql);
      try {
        if (params.length) stmt.bind(params.map(toSql));
        return fn(stmt);
      } finally {
        stmt.free();
      }
    };
    return {
      get: (...params) => withStmt(params, (s) => (s.step() ? s.getAsObject() : undefined)),
      all: (...params) => withStmt(params, (s) => {
        const rows = [];
        while (s.step()) rows.push(s.getAsObject());
        return rows;
      }),
      run: (...params) => withStmt(params, (s) => {
        s.step();
        return { changes: db.getRowsModified() };
      }),
    };
  }
}

export default { DatabaseSync };
