/**
 * Builds the playable faceless VSL preview (dist/vsl-preview.html) from the
 * real VSL back end: the foundation, every niche pack and the faceless format.
 * Change a pack or the foundation, run `npm run build:vsl-preview`, and the
 * preview follows.
 *
 * Each section's cards are stretched to fill its time window (the screen
 * recording and b-roll hold the time between lines); a section that runs long
 * pushes the next one back.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScript } from '../server/modules/vsl/builder.js';
import { PACKS } from '../server/modules/vsl/niches.js';
import { PAGE, SECTIONS } from '../server/modules/vsl/foundation.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const round1 = (n) => Math.round(n * 10) / 10;

function timeline(built) {
  const cards = [];
  let t = 0;
  for (const s of built.sections) {
    const own = built.cards.filter((c) => c.section === s.key);
    const natural = own.reduce((n, c) => n + (c.end - c.start), 0);
    const start = Math.max(t, s.start);
    const room = s.end - start;
    const scale = natural && natural < room ? room / natural : 1;
    t = start;
    for (const c of own) {
      const d = (c.end - c.start) * scale;
      cards.push({ section: s.key, line: c.line, start: round1(t), end: round1(t + d), text: c.text });
      t += d;
    }
  }
  return { cards, total: round1(Math.max(t, SECTIONS.at(-1).end)) };
}

const packs = Object.entries(PACKS).map(([key, pack]) => {
  const built = buildScript({ pack, packKey: key, format: 'faceless' });
  const { cards, total } = timeline(built);
  const lineStart = {};
  for (const c of cards) if (lineStart[c.line] === undefined) lineStart[c.line] = c.start;
  return {
    key, label: built.niche.label, status: built.niche.status, vars: built.niche.vars, hooks: built.hook.options,
    sections: built.sections.map((s) => ({
      key: s.key, number: s.number, title: s.title, window: s.window, start: s.start, end: s.end, direction: s.direction,
      lines: s.lines.map((l) => ({ key: l.key, kind: l.kind, text: l.text, visual: l.visual, step: l.step || null, placeholder: Boolean(l.placeholder), at: lineStart[l.key] ?? null })),
    })),
    cards, total,
  };
});

const font = fs.readFileSync(path.join(root, 'public/fonts/plus-jakarta-sans-latin.woff2')).toString('base64');
const template = fs.readFileSync(path.join(root, 'scripts/vsl-preview.html'), 'utf8');
const html = template
  .replace('/*__FONT__*/', `url(data:font/woff2;base64,${font}) format('woff2')`)
  .replace('/*__DATA__*/null', JSON.stringify({ packs, button: PAGE.button_text }));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/vsl-preview.html'), html);
console.log(`Built dist/vsl-preview.html (${Math.round(html.length / 1024)} KB): ${packs.map((p) => `${p.key} ${Math.floor(p.total / 60)}:${String(Math.round(p.total % 60)).padStart(2, '0')}`).join(', ')}`);
