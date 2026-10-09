import fs from 'node:fs';
import path from 'node:path';

// Minimal .env loader so the project runs with zero extra dependencies.
const envFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

export const config = {
  port: Number(process.env.PORT || 3000),
  databasePath: process.env.DATABASE_PATH || './data/cm-automations.db',
  schedulerIntervalSeconds: Number(process.env.SCHEDULER_INTERVAL_SECONDS || 30),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  sessionDays: 30,
  // The address people use to reach this system; used in links sent by text,
  // WhatsApp and email (booking pages, invoices, proposals, reports).
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  // Texts, WhatsApp and calls (Twilio). Without these, messages run in demo mode.
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  // Email sending (Resend). Without a key, email runs in demo mode.
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || '',
  // Card payments (Stripe). Without a key, invoices show bank transfer details.
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  // Sign-in needs a password. Setting REQUIRE_PASSWORDS=false in .env switches
  // to email-only sign-in (useful for short test sessions only).
  requirePasswords: process.env.REQUIRE_PASSWORDS !== 'false',
  // Encrypts the keys each business connects in Settings → Connections. Set this
  // on a live server (any long random text) and keep it safe; if it changes,
  // businesses have to reconnect. Without it, one is created in the data folder.
  appSecret: process.env.APP_SECRET || '',
  // Test builds only: lets "pay by card" be simulated without Stripe. Never set this on a live system.
  demoMode: process.env.DEMO_MODE === 'true',
};
