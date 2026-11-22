// Packs HQ (public/hq) into one self-contained page that runs anywhere –
// opened from a file, hosted on any site, or shared as a preview. Without your
// server it saves in the viewer's browser and the agents use their built-in
// templates (Claude needs the server).
//   npm run build:hq  →  dist/hq/hq.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'public', 'hq');
const out = path.join(root, 'dist', 'hq');
fs.mkdirSync(out, { recursive: true });

const js = await esbuild.build({
  entryPoints: [path.join(src, 'app.js')],
  bundle: true, format: 'esm', minify: true, write: false, legalComments: 'none',
  target: ['es2020', 'safari15', 'chrome90', 'firefox90'],
});
const font = fs.readFileSync(path.join(root, 'public', 'fonts', 'plus-jakarta-sans-latin.woff2')).toString('base64');
const css = fs.readFileSync(path.join(src, 'hq.css'), 'utf8')
  .replace("url('../fonts/plus-jakarta-sans-latin.woff2')", `url(data:font/woff2;base64,${font})`);
const html = fs.readFileSync(path.join(src, 'index.html'), 'utf8')
  .replace('<link rel="stylesheet" href="hq.css">', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="app.js"></script>', () => `<script type="module">\n${js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}\n</script>`);

fs.writeFileSync(path.join(out, 'hq.html'), html);
console.log(`HQ built: dist/hq/hq.html (${Math.round(html.length / 1024)} KB)`);
