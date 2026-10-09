/**
 * npm run check:live – run on the live server before (and after) going live.
 *
 * Lists anything in the server settings that stops real messages or payments,
 * then checks every business's connected Twilio, Stripe and email accounts
 * against the real services (the same checks as the Test buttons in
 * Settings → Connections). Nothing is sent and nothing is changed.
 */
import { config } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { liveWarnings } from '../server/lib/live-check.js';
import { getMessagingSettings } from '../server/modules/messaging/service.js';
import { checkEmail, checkStripe, checkTwilio, connectionStatus, getCredentials } from '../server/modules/integrations/service.js';

const tick = (ok) => (ok ? '✅' : '❌');
let problems = 0;

console.log(`\nServer settings (PUBLIC_URL ${config.publicUrl})`);
const warnings = liveWarnings();
for (const w of warnings) console.log(`  ⚠️  ${w}`);
if (!warnings.length) console.log('  ✅ Ready');
problems += warnings.length;

const db = openDatabase(config.databasePath);
const orgs = db.all('SELECT id, name FROM organizations ORDER BY name');
if (!orgs.length) console.log('\nNo businesses yet – sign up, then connect accounts in Settings → Connections.');

for (const org of orgs) {
  const creds = getCredentials(db, org.id);
  const status = connectionStatus(db, org.id);
  const s = getMessagingSettings(db, org.id);
  const numbers = [s.business_number, s.whatsapp_number].filter(Boolean);
  console.log(`\n${org.name}`);

  if (!creds.twilio) console.log('  – Twilio: not connected (texts, WhatsApp and calls stay in demo mode)');
  else {
    const t = await checkTwilio(creds.twilio, numbers);
    console.log(`  ${tick(t.ok)} Twilio${t.account ? ` (${t.account})` : ''}${t.message ? `: ${t.message}` : ''}`);
    if (t.warning) console.log(`     ⚠️  ${t.warning}`);
    for (const n of t.numbers || []) {
      const ready = n.found && n.voice && n.sms;
      console.log(`     ${tick(ready)} ${n.number}: ${!n.found ? 'not a number in this Twilio account (fine if it is a WhatsApp sender – check its webhook in Twilio)' : ready ? 'calls and texts come here' : 'not pointed here yet – press “Point my numbers here”'}`);
      if (!ready && n.found) problems++;
    }
    if (!numbers.length) console.log('     ⚠️  No business number set – add it in Settings → Phone & alerts');
    if (!t.ok) problems++;
  }

  if (!creds.stripe) console.log('  – Stripe: not connected (invoices show bank details only)');
  else {
    const st = await checkStripe(creds.stripe);
    console.log(`  ${tick(st.ok)} Stripe (${status.stripe.mode} mode)${st.message ? `: ${st.message}` : ''}`);
    if (status.stripe.mode === 'test') console.log('     ⚠️  Test key – customers can’t pay real money. Use a live key (sk_live_ / rk_live_) when ready.');
    if (!status.stripe.webhook) console.log('     ⚠️  Payment notifications not set up – press “Set up payment notifications”. (Payments are still confirmed when the customer returns to the invoice page.)');
    if (!st.ok) problems++;
  }

  if (!creds.email) console.log('  – Email: not connected (emails stay in demo mode)');
  else {
    const e = await checkEmail(creds.email);
    console.log(`  ${tick(e.ok)} Email from ${creds.email.from}${e.message ? `: ${e.message}` : ''}`);
    if (!e.ok) problems++;
  }
}

console.log(problems ? `\n${problems} thing(s) to sort before going live.\n` : '\nAll set – real messages and payments will go out.\n');
process.exitCode = problems ? 1 : 0;
