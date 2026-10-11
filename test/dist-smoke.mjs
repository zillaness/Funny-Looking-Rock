// Copyright (C) 2026 Projects and Mods
// GPL-3.0-or-later WITH Commons Clause (non-commercial) - see LICENSE.

// Smoke-test the SHIPPED bundle, from a file:// URL, which is how it is meant
// to be used and the one thing the other browser tests never do: they serve
// the source tree over http and never touch dist/. A bug that only exists in
// the bundle (the inlined Manifold wasm failing to decode, a node: stub that
// esbuild resolved wrong, an import.meta.url define that broke, an export
// tree-shaken away) passes the whole suite and fails for every person who
// downloaded the file.
//
//   npm run smoke      (rebuilds, then runs this)
//
// Deliberately shallow: load, pick a blank, type a code, generate, export.
// Behaviour is pinned down in keyui_smoke / orient_smoke / bowdetect_smoke /
// rectify_smoke. (Ported from 2.5D's test/dist-smoke.mjs.)

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist', 'funny-looking-rock.html');
if (!fs.existsSync(dist)) { console.error(`missing ${dist} — run: node build.mjs`); process.exit(1); }

const execPath = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH].filter(Boolean)
  .flatMap(c => { try { const st = fs.statSync(c); if (st.isFile()) return [c]; return ['chrome-linux/chrome', 'chrome-linux/headless_shell', 'chrome'].map(s => path.join(c, s)); } catch { return []; } })
  .find(p => fs.existsSync(p));

const browser = await chromium.launch({ executablePath: execPath || undefined, args: ['--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${ok || !detail ? '' : ` — ${detail}`}`); if (!ok) fails++; };

await page.goto('file://' + dist);
await page.waitForFunction(() => window.keyUI && document.getElementById('blankSel').options.length > 0, null, { timeout: 20000 });
check('bundle loads from file://, blanks populated', true);

const head = fs.readFileSync(dist, 'utf8').slice(0, 400);
check('header names this repo as the source', head.includes('github.com/zillaness/Funny-Looking-Rock'), head.split('\n')[1]);

const wasm = await page.evaluate(() => typeof window.__FLR_MANIFOLD_WASM === 'string' && window.__FLR_MANIFOLD_WASM.length > 100000);
check('Manifold wasm is inlined', wasm);

// Type a known SC1 code, generate, and make sure a mesh came out.
const gen = await page.evaluate(async () => {
  const sel = document.getElementById('blankSel');
  sel.value = 'SC1'; sel.dispatchEvent(new Event('change'));
  const inp = document.getElementById('bittingInput');
  inp.value = '4-2-1-4-5'; inp.dispatchEvent(new Event('input'));
  const ui = window.keyUI;
  if (!ui.state.decoded) return { ok: false, why: 'typed code was not accepted' };
  await ui.generate();
  const m = ui.state.mesh;
  if (!m || !m.positions || !m.indices) return { ok: false, why: 'no mesh' };
  // every edge shared by exactly two triangles → closed surface
  const edges = new Map();
  for (let t = 0; t < m.indices.length; t += 3) {
    const tri = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
    for (let k = 0; k < 3; k++) { const a = tri[k], b = tri[(k + 1) % 3]; const key = a < b ? `${a}_${b}` : `${b}_${a}`; edges.set(key, (edges.get(key) || 0) + 1); }
  }
  let open = 0; for (const n of edges.values()) if (n !== 2) open++;
  return { ok: true, tris: m.indices.length / 3, open, sizeX: m.stats.sizeX, sizeZ: m.stats.sizeZ, status: document.getElementById('status').textContent };
});
check('typed code → generated key', gen.ok, gen.why);
if (gen.ok) {
  check(`mesh has triangles (${gen.tris})`, gen.tris > 100);
  check(`mesh is watertight (${gen.open} open edges)`, gen.open === 0);
  check(`key is key-sized (${gen.sizeX.toFixed(1)} × ${gen.sizeZ.toFixed(1)} mm)`, gen.sizeX > 40 && gen.sizeX < 90 && gen.sizeZ > 10 && gen.sizeZ < 40);
  check('export button enabled', await page.evaluate(() => !document.getElementById('exportBtn').disabled));
}

// Card detection in the bundle: a synthetic bright CR80 (rounded corners) on
// a dark desk, detected and edge-fitted, with the aspect check agreeing.
const card = await page.evaluate(async () => {
  const W = 1400, H = 1000, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2a2e'; g.fillRect(0, 0, W, H);
  const s = 11, cw = 85.60 * s, ch = 53.98 * s, r = 3.18 * s, x0 = (W - cw) / 2 + 20, y0 = (H - ch) / 2 - 10;
  g.fillStyle = '#e8e2d0';
  g.beginPath(); g.roundRect(x0, y0, cw, ch, r); g.fill();
  g.fillStyle = '#b8a060'; g.fillRect(x0 + 60, y0 + 230, 700, 95);   // a key blade across the card
  const ui = window.keyUI;
  await new Promise(res => { ui.loadImage(c.toDataURL()); const t = setInterval(() => { if (ui.state.img && ui.state.img.width === W) { clearInterval(t); res(); } }, 20); });
  const q = ui.detectCard();
  const truth = [{ x: x0, y: y0 }, { x: x0 + cw, y: y0 }, { x: x0 + cw, y: y0 + ch }, { x: x0, y: y0 + ch }];
  const err = q ? Math.max(...q.map((p, i) => Math.hypot(p.x - truth[i].x, p.y - truth[i].y))) : null;
  return { found: !!q, err, fitted: !!ui.state.cardFit, rms: ui.state.cardFit?.rms, warnHidden: document.getElementById('cardAspectWarn').hidden, readout: document.getElementById('scaleReadout').textContent };
});
check('card detected in the bundle', card.found);
if (card.found) {
  check(`edges fitted (${card.rms?.toFixed(2)} px RMS)`, card.fitted);
  // canvas pixel i spans [i, i+1) while the tool indexes pixel i at coordinate i,
  // so a drawn edge reads half a pixel low on both axes: 0.71 px is the floor.
  check(`corners within 1.5 px of the drawn card (${card.err.toFixed(2)} px, 0.71 of it is the half-pixel convention)`, card.err < 1.5);
  check('aspect check agrees the box is a CR80', card.warnHidden, card.readout);
}

check('no console or page errors', errors.length === 0, errors.join(' | '));

await browser.close();
if (fails) { console.log(`\n${fails} dist smoke check(s) FAILED ✘`); process.exit(1); }
console.log('\nDist smoke test passed ✔');
