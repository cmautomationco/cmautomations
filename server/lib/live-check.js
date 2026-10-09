import { config } from '../config.js';

/**
 * Things that stop real texts, WhatsApp messages, calls, emails or card
 * payments working on a live server. Printed when the server starts and by
 * `npm run check:live`.
 */
export function liveWarnings(env = config) {
  const out = [];
  if (env.demoMode) out.push('DEMO_MODE is on – card payments are simulated. Never set DEMO_MODE on a live server.');
  if (!/^https:\/\//.test(env.publicUrl)) out.push(`PUBLIC_URL is ${env.publicUrl} – Twilio and Stripe can only reach this system on a public https:// address, and links sent to customers use it.`);
  else if (/localhost|127\.0\.0\.1/.test(env.publicUrl)) out.push('PUBLIC_URL points at this computer – customers and Twilio/Stripe can’t reach it.');
  if (!env.appSecret) out.push('APP_SECRET is not set – connected keys are encrypted with a key kept in the data folder. Set APP_SECRET (long random text) and keep a copy somewhere safe.');
  if (!env.requirePasswords) out.push('REQUIRE_PASSWORDS=false – anyone with an email address can sign in. Turn passwords back on.');
  return out;
}
