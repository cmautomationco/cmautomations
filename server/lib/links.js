import { config } from '../config.js';

/**
 * Builds a link people can open without signing in, e.g. publicLink('book/swift-plumbing').
 * The front end uses hash routes, so the same link works on the server and in the test build.
 */
export function publicLink(path) {
  const base = config.publicUrl.replace(/\/$/, '');
  const lastSegment = base.split('/').pop();
  const join = /\.[a-z0-9]+$/i.test(lastSegment) ? '' : '/';
  return `${base}${join}#/${String(path).replace(/^\/+/, '')}`;
}
