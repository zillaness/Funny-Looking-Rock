// Copyright (C) 2026 Projects and Mods
// GPL-3.0-or-later WITH Commons Clause (non-commercial) - see LICENSE.

// Edge-fitted card corners: a synthetic card with ISO rounded corners (3.18 mm
// radius) is rendered through a known homography into an RGBA buffer, blurred
// and dusted with noise, and the fit has to recover the SHARP nominal corners
// from a deliberately off coarse quad, for a bright card on a dark desk and a
// dark card on a light desk, with a key blade crossing one edge. It also has
// to hand back the coarse quad untouched when there is no card.
//
// Pure Node — no browser needed:  node test/edgefit.mjs

import { refineCorners } from '../js/keys/edgeFit.js';

let failures = 0;
function check(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`  [${mark}] ${name}${detail ? ' — ' + detail : ''}`);
}

// Deterministic noise.
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

// ── a tiny homography toolkit (mm → px) ────────────────────────────────────
function solve(A, b) {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]]; [b[col], b[piv]] = [b[piv], b[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}
function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: X, y: Y } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); b.push(Y);
  }
  return solve(A, b);
}
const apply = (h, p) => { const d = h[6] * p.x + h[7] * p.y + 1; return { x: (h[0] * p.x + h[1] * p.y + h[2]) / d, y: (h[3] * p.x + h[4] * p.y + h[5]) / d }; };

// Render a CR80 (85.60 × 53.98 mm, r = 3.18 mm corners) seen at `quad` (px),
// card tone `cardL`, desk `deskL`, with a key blade of tone `keyL` lying across
// the card and poking over one long edge. Supersampled 3×3, then box-blurred.
function render(w, h, quad, cardL, deskL, keyL) {
  const W = 85.60, H = 53.98, R = 3.18;
  const mm = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  const px2mm = homography(quad, mm);
  const inCard = (p) => {
    const m = apply(px2mm, p);
    if (m.x < 0 || m.y < 0 || m.x > W || m.y > H) return false;
    const cx = m.x < R ? R : m.x > W - R ? W - R : m.x;
    const cy = m.y < R ? R : m.y > H - R ? H - R : m.y;
    return Math.hypot(m.x - cx, m.y - cy) <= R;
  };
  // key blade: a 9 mm wide bar from x=10 to x=92 (past the right edge), y 20..29
  const inKey = (p) => { const m = apply(px2mm, p); return m.x > 10 && m.x < 92 && m.y > 20 && m.y < 29; };
  const raw = new Float32Array(w * h);
  const S = 3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      // pixel (x, y) is centred on coordinate (x, y), the convention the sampler
      // and the rest of the tool use (pixel index = coordinate)
      const p = { x: x - 0.5 + (sx + 0.5) / S, y: y - 0.5 + (sy + 0.5) / S };
      acc += inKey(p) ? keyL : inCard(p) ? cardL : deskL;
    }
    raw[y * w + x] = acc / (S * S);
  }
  // 3×3 box blur (camera softness) + noise
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx; if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue;
      acc += raw[yy * w + xx]; n++;
    }
    const v = Math.max(0, Math.min(255, acc / n + (rnd() - 0.5) * 6));
    const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { data, w, h };
}

const w = 1600, h = 1200;
// A tilted, rotated card roughly 11 px/mm.
const truth = [{ x: 310.3, y: 260.7 }, { x: 1262.9, y: 318.2 }, { x: 1221.4, y: 915.6 }, { x: 343.8, y: 880.1 }];
// Coarse detection: each corner off by a few px, the way a 320 px downsample is.
const jitter = [{ x: 5.2, y: -4.1 }, { x: -6.3, y: 3.7 }, { x: 4.4, y: 5.9 }, { x: -3.8, y: -5.5 }];
const coarse = truth.map((p, i) => ({ x: p.x + jitter[i].x, y: p.y + jitter[i].y }));
const maxErr = (q) => Math.max(...q.map((p, i) => Math.hypot(p.x - truth[i].x, p.y - truth[i].y)));

for (const [label, cardL, deskL, keyL, pol] of [
  ['bright card on a dark desk', 225, 60, 180, 1],
  ['dark card on a light desk', 50, 215, 190, -1],
]) {
  console.log(`\n${label}:`);
  const img = render(w, h, truth, cardL, deskL, keyL);
  const before = maxErr(coarse);
  const r = refineCorners(img, coarse, { polarity: pol });
  check('fit succeeds', r.ok, r.reason || '');
  if (r.ok) {
    const after = maxErr(r.corners);
    check(`corners within 0.5 px of the nominal (was ${before.toFixed(1)} px, now ${after.toFixed(2)} px)`, after < 0.5);
    check('every edge fitted most of its profiles', r.edges.every(e => e.inliers >= 0.6 * e.total),
      r.edges.map(e => `${e.inliers}/${e.total}`).join(' '));
    check('edge RMS under half a pixel', r.edges.every(e => e.rms < 0.5), r.edges.map(e => e.rms.toFixed(2)).join(' '));
  }
  const auto = refineCorners(img, coarse);   // polarity unknown
  check('polarity auto-detected', auto.ok && auto.polarity === pol, `got ${auto.polarity}`);
  if (auto.ok) check('auto result matches the known-polarity fit', maxErr(auto.corners) < 0.5);
}

console.log('\nno card at all:');
{
  const flat = { data: new Uint8ClampedArray(w * h * 4).fill(120), w, h };
  const r = refineCorners(flat, coarse);
  check('fit declines', !r.ok, r.reason || '');
  check('coarse quad handed back untouched', r.corners === coarse);
}

console.log('\nwrong polarity asked for:');
{
  const img = render(w, h, truth, 225, 60, 180);
  const r = refineCorners(img, coarse, { polarity: -1 });
  check('fit declines rather than inventing an edge', !r.ok, r.reason || '');
}

console.log(failures === 0 ? '\nAll edge-fit checks passed ✔' : `\n${failures} check(s) FAILED ✘`);
process.exit(failures === 0 ? 0 : 1);
