// Builds the browser test build: one self-contained page that runs the real
// server modules, SQLite (sql.js) and the front end entirely in the browser.
//   npm run build:test   → dist/test-build/cm-automations.html (to publish)
//                          dist/test-build/index.html          (to open locally)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'test-build');
fs.mkdirSync(out, { recursive: true });

const shims = { crypto: 'crypto', sqlite: 'sqlite', fs: 'fs', path: 'path', url: 'url' };
const shimPlugin = {
  name: 'browser-shims',
  setup(build) {
    build.onResolve({ filter: /^node:/ }, (args) => {
      const name = args.path.slice(5);
      if (!shims[name]) throw new Error(`No browser shim for ${args.path} (imported by ${args.importer})`);
      return { path: path.join(root, 'demo', 'shims', `${shims[name]}.js`) };
    });
    build.onResolve({ filter: /^express$/ }, () => ({ path: path.join(root, 'demo', 'shims', 'express.js') }));
    build.onResolve({ filter: /^@anthropic-ai\/sdk$/ }, () => ({ path: path.join(root, 'demo', 'shims', 'anthropic.js') }));
  },
};

const result = await esbuild.build({
  entryPoints: [path.join(root, 'demo', 'boot.js')],
  bundle: true,
  format: 'esm',
  // Older phones (e.g. iOS 15 Safari) must be able to run it, so newer syntax is converted.
  target: ['es2020', 'safari15', 'chrome90', 'firefox90'],
  platform: 'browser',
  minify: true,
  legalComments: 'none',
  write: false,
  loader: { '.sql': 'text' },
  plugins: [shimPlugin],
});
const appJs = result.outputFiles[0].text;

const font = fs.readFileSync(path.join(root, 'public', 'fonts', 'plus-jakarta-sans-latin.woff2')).toString('base64');
const css = fs.readFileSync(path.join(root, 'public', 'css', 'app.css'), 'utf8')
  .replace("url('/fonts/plus-jakarta-sans-latin.woff2')", `url(data:font/woff2;base64,${font})`)
  + fs.readFileSync(path.join(root, 'demo', 'demo.css'), 'utf8');
const sqljs = fs.readFileSync(path.join(root, 'node_modules', 'sql.js', 'dist', 'sql-asm.js'), 'utf8');

// Inline scripts must not contain sequences that end or confuse the HTML script element.
const safe = (js) => js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

const page = `<title>CM Automations</title>
<style>${css}</style>
<div id="app"><div id="boot-status" class="boot">Loading CM Automations…</div></div>
<div class="toast-wrap" id="toasts"></div>
<script>
// Start-up safety net (plain script, so it runs even if the main code can't):
// if the system fails or never starts, explain why and offer a clean start.
(function () {
  function show(reason) {
    var box = document.getElementById('boot-status');
    if (!box || box.dataset.failed) return;
    box.dataset.failed = '1';
    box.innerHTML = '<div class="boot-card"><b>CM Automations couldn’t start</b>'
      + '<p>This can happen if data saved by an earlier test version is getting in the way, or the browser is out of date.</p>'
      + '<p>Press Start fresh to clear the saved test data and reload. If it still won’t open, update your phone or try the link on a computer.</p>'
      + '<button class="btn primary" type="button" id="boot-reset">Start fresh</button>'
      + '<p class="small muted" id="boot-reason"></p></div>';
    document.getElementById('boot-reason').textContent = reason ? 'Details: ' + reason : '';
    document.getElementById('boot-reset').onclick = function () {
      try { localStorage.clear(); } catch (e) {}
      try { sessionStorage.clear(); } catch (e) {}
      var done = function () { location.reload(); };
      try { var r = indexedDB.deleteDatabase('cm-automations-test'); r.onsuccess = r.onerror = r.onblocked = done; setTimeout(done, 1500); } catch (e) { done(); }
    };
  }
  window.__cmBootFailed = show;
  window.addEventListener('error', function (e) { if (document.getElementById('boot-status')) show(e.message); });
  setTimeout(function () { if (document.getElementById('boot-status')) show('Start-up took too long.'); }, 20000);
})();
</script>
<script>${safe(sqljs)}</script>
<script type="module">${safe(appJs)}</script>
`;

fs.writeFileSync(path.join(out, 'cm-automations.html'), page);
// Local copy with the document wrapper and a strict CSP that blocks all network
// access, proving the build runs fully self-contained.
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:">
</head><body>
${page}</body></html>
`);
// Written walkthrough for the repository, from the same steps as the in-app panel.
const { GUIDE } = await import('../demo/guide.js');
const md = ['# CM Automations – test build walkthrough', '',
  'Open the test build, sign in with the pre-filled demo details, then work through each section.',
  'Every step below matches the **Walkthrough** panel inside the app (bottom of the screen), where each step has an **Open** button that takes you to the right screen.', ''];
GUIDE.forEach((section, i) => {
  md.push(`## ${i + 1}. ${section.title}`, '', section.intro, '');
  section.steps.forEach(([text]) => md.push(`- [ ] ${text}`));
  md.push('');
});
fs.writeFileSync(path.join(root, 'docs', 'WALKTHROUGH.md'), md.join('\n'));
console.log(`Built ${path.relative(root, out)}/cm-automations.html (${(page.length / 1024 / 1024).toFixed(2)} MB)`);
