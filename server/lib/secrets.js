import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/**
 * Encrypts the API keys businesses connect (Twilio, Stripe, email) before they
 * are stored, using AES-256-GCM. The key comes from APP_SECRET, or a random one
 * created once next to the database file and kept there.
 */
let key = null;

/** False in the browser test build, which can't hold real keys. */
export const secretsAvailable = () => typeof crypto.createCipheriv === 'function' && typeof crypto.createHash === 'function';

function getKey() {
  if (key) return key;
  let secret = config.appSecret;
  if (!secret && config.databasePath && config.databasePath !== ':memory:') {
    const file = path.join(path.dirname(path.resolve(config.databasePath)), '.app-secret');
    try {
      if (fs.existsSync(file)) secret = fs.readFileSync(file, 'utf8').trim();
      else {
        secret = crypto.randomBytes(32).toString('hex');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, secret, { mode: 0o600 });
      }
    } catch { /* fall through to a per-process key */ }
  }
  if (!secret) secret = crypto.randomBytes(32).toString('hex');
  key = crypto.createHash('sha256').update(String(secret)).digest();
  return key;
}

/** For tests: forget the cached key (e.g. after changing APP_SECRET). */
export const resetSecretKey = () => { key = null; };

export function encryptSecret(text) {
  if (!secretsAvailable()) throw new Error('Keys can only be stored on the live server');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}

export function decryptSecret(value) {
  if (!value || !secretsAvailable()) return null;
  const [prefix, version, iv, tag, data] = String(value).split(':');
  if (prefix !== 'enc' || version !== 'v1') return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null; // wrong key (APP_SECRET changed) – treated as not connected
  }
}

/** "sk_live_…a1b2" – enough to recognise a key without revealing it. */
export const maskSecret = (s) => (s ? `${String(s).slice(0, Math.min(8, Math.floor(String(s).length / 3)))}…${String(s).slice(-4)}` : '');
