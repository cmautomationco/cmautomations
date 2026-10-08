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
  // Sign-in needs a password. Setting REQUIRE_PASSWORDS=false in .env switches
  // to email-only sign-in (useful for short test sessions only).
  requirePasswords: process.env.REQUIRE_PASSWORDS !== 'false',
};
