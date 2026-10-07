import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { config } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { createApp } from '../server/app.js';

let server;
let base;
const original = config.requirePasswords;

before(() => {
  server = createApp(openDatabase(':memory:')).app.listen(0);
  base = `http://localhost:${server.address().port}/api`;
});
after(() => { config.requirePasswords = original; server.close(); });

const call = async (method, path, body, token) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};

test('with passwords switched off, an email is enough to register, add a teammate and sign in', async () => {
  config.requirePasswords = false;
  assert.equal((await call('GET', '/meta')).body.require_passwords, false);
  const reg = await call('POST', '/auth/register', { name: 'No Pass', email: 'nopass@test.com', business_name: 'Open Co' });
  assert.equal(reg.status, 201);
  const team = await call('POST', '/team', { name: 'Teammate', email: 'mate@test.com' }, reg.body.token);
  assert.equal(team.status, 201);
  assert.equal((await call('POST', '/auth/login', { email: 'NoPass@test.com' })).status, 200);
  assert.equal((await call('POST', '/auth/login', { email: 'mate@test.com' })).status, 200);
  assert.equal((await call('POST', '/auth/login', { email: 'nobody@test.com' })).status, 401);
});

test('with passwords switched back on, the password is required and checked', async () => {
  config.requirePasswords = true;
  assert.equal((await call('GET', '/meta')).body.require_passwords, true);
  assert.equal((await call('POST', '/auth/register', { name: 'P', email: 'p@test.com', business_name: 'P Co' })).status, 400);
  assert.equal((await call('POST', '/auth/register', { name: 'P', email: 'p@test.com', password: 'longenough1', business_name: 'P Co' })).status, 201);
  assert.equal((await call('POST', '/auth/login', { email: 'p@test.com' })).status, 400);
  assert.equal((await call('POST', '/auth/login', { email: 'p@test.com', password: 'wrong-password' })).status, 401);
  assert.equal((await call('POST', '/auth/login', { email: 'p@test.com', password: 'longenough1' })).status, 200);
  // Accounts made while passwords were off can't be signed into with a guess.
  assert.equal((await call('POST', '/auth/login', { email: 'nopass@test.com', password: 'anything' })).status, 401);
});
