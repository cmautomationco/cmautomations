import crypto from 'node:crypto';
import { config } from '../config.js';
import { HttpError, addDays, now } from './util.js';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export function createSession(db, userId, orgId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.insert('sessions', { token, user_id: userId, org_id: orgId, expires_at: addDays(now(), config.sessionDays) });
  return token;
}

/** Resolves the bearer token into req.user / req.org / req.role. */
export function requireAuth(db) {
  return (req, _res, next) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next(new HttpError(401, 'Sign in required'));
    const row = db.get(
      `SELECT s.expires_at, s.org_id, u.id AS user_id, u.name AS user_name, u.email, m.role
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         JOIN memberships m ON m.user_id = u.id AND m.org_id = s.org_id
        WHERE s.token = ?`, token);
    if (!row || row.expires_at < now()) return next(new HttpError(401, 'Session expired, please sign in again'));
    req.token = token;
    req.user = { id: row.user_id, name: row.user_name, email: row.email };
    req.org = db.get('SELECT * FROM organizations WHERE id = ?', row.org_id);
    req.role = row.role;
    next();
  };
}

export function requireRole(...roles) {
  return (req, _res, next) => (roles.includes(req.role) ? next() : next(new HttpError(403, 'You do not have permission to do that')));
}
