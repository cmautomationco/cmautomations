import assert from 'node:assert/strict';
import { test } from 'node:test';
import { liveWarnings } from '../server/lib/live-check.js';

/** What `npm run check:live` and the server's start-up warnings flag before going live. */
const ready = { publicUrl: 'https://app.swiftplumbing.co.uk', appSecret: 'x'.repeat(64), requirePasswords: true, demoMode: false };

test('a properly set-up live server has nothing to fix', () => {
  assert.deepEqual(liveWarnings(ready), []);
});

test('each setting that stops real messages or payments is explained', () => {
  assert.match(liveWarnings({ ...ready, publicUrl: 'http://localhost:3000' })[0], /https/);
  assert.match(liveWarnings({ ...ready, publicUrl: 'https://localhost:3000' })[0], /can’t reach it/);
  assert.match(liveWarnings({ ...ready, appSecret: '' })[0], /APP_SECRET/);
  assert.match(liveWarnings({ ...ready, demoMode: true })[0], /DEMO_MODE/);
  assert.match(liveWarnings({ ...ready, requirePasswords: false })[0], /passwords/i);
});
