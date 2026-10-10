// Builds dist/web from web/ for deploying: every run of <script src> tags in index.html is merged, in the same
// order, into one minified bundle (inline scripts and lib/ files, already minified, stay as they are and split
// the runs). The pack files packs.js would load go into the bundle right after it. Everything else is copied.
// Run: npm run build
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'web'), out = path.join(root, 'dist', 'web');
const require = createRequire(import.meta.url);
for (const f of ['engine/util.js', 'engine/registry.js', 'packs.js']) require(path.join(src, f));
const packFiles = globalThis.RRR.packFiles(globalThis.RRR.manifest);

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });

const read = f => fs.readFileSync(path.join(src, f), 'utf8');
let html = read('index.html'), n = 0, before = 0, after = 0;
for (const [run] of html.matchAll(/(?:<script src="(?!lib\/)[^"]+"><\/script>\n)+/g)) {
  const files = [...run.matchAll(/src="([^"]+)"/g)].flatMap(([, f]) => (f === 'packs.js' ? [f, ...packFiles] : [f]));
  const texts = files.map(read);
  // keep strict mode only if every file asked for it; RRR.bundled tells RRR.load not to fetch the packs again.
  // ';' between files: one that ends without a semicolon must not run into the next one's first line
  const head = (texts.every(t => t.startsWith("'use strict'")) ? "'use strict';\n" : '') +
    (files.includes('packs.js') ? 'globalThis.RRR = globalThis.RRR || {}; RRR.bundled = true;\n' : '');
  const code = head + texts.join('\n;\n');
  // names are kept (no identifier minifying): error reports name the function that failed (componentOf)
  const min = (await transform(code, { minifyWhitespace: true, minifySyntax: true, legalComments: 'none' })).code;
  const name = `app-${++n}.${crypto.createHash('sha1').update(min).digest('hex').slice(0, 8)}.js`; // new name per change: no stale cache
  fs.writeFileSync(path.join(out, name), min);
  for (const f of files) fs.rmSync(path.join(out, f));
  html = html.replace(run, `<script src="${name}"></script>\n`);
  before += code.length; after += min.length;
  console.log(`▸ ${name}: ${files.length} files`);
}
fs.writeFileSync(path.join(out, 'index.html'), html);
// drop folders the bundles emptied
const prune = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) prune(path.join(d, e.name)); if (d !== out && !fs.readdirSync(d).length) fs.rmdirSync(d); };
prune(out);
console.log(`✓ dist/web: scripts ${(before / 1e6).toFixed(2)} MB → ${(after / 1e6).toFixed(2)} MB`);
