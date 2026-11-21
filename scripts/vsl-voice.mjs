/**
 * Voices a VSL script so it can be heard, then times the video to the voice.
 *
 *   Kokoro (natural, recommended):
 *     KOKORO_DIR=/path/with/model KOKORO_PYTHON=/path/to/python KOKORO_VOICE="bm_george:0.65,bm_lewis:0.35" \
 *       node scripts/vsl-voice.mjs [pack] [hook]
 *   Piper (older test voice):
 *     PIPER=/path/to/piper PIPER_VOICE=/path/to/voice.onnx node scripts/vsl-voice.mjs [pack] [hook]
 *
 * Both are free and open-source. Swap in a paid AI voice or your own recording
 * later: anything that gives one audio clip per line fits the same manifest.
 *
 * Writes dist/vsl-voice/<pack>.m4a (the whole voice track) and
 * dist/vsl-voice/<pack>.json (when each line starts and ends). The preview
 * build picks these up and plays the voice in time with the cards.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScript } from '../server/modules/vsl/builder.js';
import { PACKS } from '../server/modules/vsl/niches.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const packKey = process.argv[2] || 'wellness';
const hook = Number(process.argv[3] || 0);
const piper = process.env.PIPER;
const kokoroDir = process.env.KOKORO_DIR;
const engine = kokoroDir ? 'kokoro' : 'piper';
const voice = engine === 'kokoro' ? (process.env.KOKORO_VOICE || 'bm_george:0.65,bm_lewis:0.35') : process.env.PIPER_VOICE;
if (engine === 'piper' && (!piper || !voice)) throw new Error('Set KOKORO_DIR (recommended), or PIPER and PIPER_VOICE');
if (!PACKS[packKey]) throw new Error(`No pack called ${packKey}`);

const out = path.join(root, 'dist', 'vsl-voice');
const work = path.join(out, `${packKey}-lines`);
fs.mkdirSync(work, { recursive: true });

// How the words are said, not what's shown: times and symbols read naturally.
const spoken = (t) => t
  .replace(/\b5pm sweep\b/g, 'five o\'clock sweep').replace(/(\d+)pm\b/g, '$1 p.m.').replace(/(\d+)am\b/g, '$1 a.m.')
  .replace(/\bVA\b/g, 'V.A.')
  .replace(/\bPTs\b/g, 'P.T.s').replace(/\bPT\b/g, 'P.T.')
  .replace(/[“”]/g, '').replace(/’/g, "'");

const built = buildScript({ pack: PACKS[packKey], packKey, format: 'voiceover', hook });
// Pauses between lines. Short, like breaths in natural speech, so it flows rather than stopping and starting.
const GAP = { line: Number(process.env.GAP_LINE ?? 0.3), demo: Number(process.env.GAP_DEMO ?? 0.55), section: Number(process.env.GAP_SECTION ?? 0.7), placeholder: 4 };
const duration = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]).toString().trim());

// Every line to say, in order. Placeholders are shown, never read out.
const todo = built.sections.flatMap((s) => s.lines.map((l) => ({ l, s })));
const silent = ({ l }) => l.placeholder || /^\[.*\]$/.test(l.text);
todo.forEach((x, i) => { x.file = path.join(work, `${String(i).padStart(2, '0')}-${x.l.key.replace(/[^\w.-]/g, '_')}.wav`); });
const speak = todo.filter((x) => !silent(x));
if (engine === 'kokoro') {
  const job = { model: path.join(kokoroDir, 'kokoro-v1.0.onnx'), voices: path.join(kokoroDir, 'voices-v1.0.bin'), voice, speed: Number(process.env.KOKORO_SPEED || 0.96), lang: 'en-gb',
    lines: speak.map((x) => ({ text: spoken(x.l.text), file: x.file })) };
  execFileSync(process.env.KOKORO_PYTHON || 'python3', [path.join(root, 'scripts', 'tts_kokoro.py')], { input: JSON.stringify(job), stdio: ['pipe', 'ignore', 'inherit'] });
} else {
  for (const x of speak) execFileSync(piper, ['-m', voice, '-f', x.file, '--length_scale', '1.08', '--sentence_silence', '0.25'], { input: spoken(x.l.text), stdio: ['pipe', 'ignore', 'ignore'] });
}

const lines = [];
let t = 0;
let prevSection = null;
for (const x of todo) {
  const { l, s } = x;
  if (lines.length) t += prevSection !== s.key ? GAP.section : l.kind === 'demo' ? GAP.demo : GAP.line;
  prevSection = s.key;
  if (silent(x)) {
    lines.push({ key: l.key, section: s.key, start: round(t), end: round(t + GAP.placeholder), silent: true });
    t += GAP.placeholder;
    continue;
  }
  const d = duration(x.file);
  lines.push({ key: l.key, section: s.key, start: round(t), end: round(t + d), file: x.file });
  t += d;
}
const total = round(t + 1.5);

// One track: each clip placed at its start time.
const voiced = lines.filter((l) => l.file);
const args = ['-y', '-loglevel', 'error'];
for (const l of voiced) args.push('-i', l.file);
const filters = voiced.map((l, i) => `[${i}:a]aresample=44100,adelay=${Math.round(l.start * 1000)}:all=1[a${i}]`).join(';');
args.push('-filter_complex', `${filters};${voiced.map((_, i) => `[a${i}]`).join('')}amix=inputs=${voiced.length}:normalize=0,apad=whole_dur=${total}[out]`,
  '-map', '[out]', '-ac', '1', '-c:a', 'aac', '-b:a', '64k', path.join(out, `${packKey}.m4a`));
execFileSync('ffmpeg', args);

const manifest = { pack: packKey, hook, voice: engine === 'kokoro' ? voice : path.basename(voice), engine, total, lines: lines.map(({ file, ...rest }) => rest) };
fs.writeFileSync(path.join(out, `${packKey}.json`), JSON.stringify(manifest, null, 2));
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
console.log(`Voiced ${packKey}: ${voiced.length} lines, runs ${clock(total)}`);
for (const s of built.sections) {
  const own = lines.filter((l) => l.section === s.key);
  console.log(`  ${s.number}. ${s.title}: ${clock(own[0].start)}–${clock(own.at(-1).end)} (brief: ${s.window})`);
}

function round(n) { return Math.round(n * 100) / 100; }
