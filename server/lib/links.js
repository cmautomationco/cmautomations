import { config } from '../config.js';

/**
 * Builds a link people can open without signing in, e.g. publicLink('book/swift-plumbing').
 * The front end uses hash routes, so the same link works on the server and in the test build.
 */
export function publicLink(path) {
  const base = config.publicUrl.replace(/\/$/, '');
  let isFile = false;
  try { isFile = /\.[a-z0-9]+$/i.test(new URL(base).pathname); } catch { /* not a full URL */ }
  return `${base}${isFile ? '' : '/'}#/${String(path).replace(/^\/+/, '')}`;
}

/**
 * The server's own address (for webhooks and the calendar feed): PUBLIC_URL
 * without any page file name on the end, e.g. https://app.example.com or
 * https://example.com/cm (never cuts into the domain name itself).
 */
export function serverBase(url = config.publicUrl) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/[^/]*\.[a-z0-9]+$/i, '').replace(/\/+$/, '');
    return `${u.origin}${path}`;
  } catch {
    return String(url).replace(/\/+$/, '');
  }
}
