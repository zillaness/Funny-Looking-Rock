// Copyright (C) 2026 Projects and Mods
// GPL-3.0-or-later WITH Commons Clause (non-commercial) - see LICENSE.

// Reference aspect check: project each preset through a pinhole camera at a
// few tilts and focal lengths, then make sure the right pick is never flagged
// and the presets a depth step apart are caught, with the right suggestion.
//
// Pure Node — no browser needed:  node test/cardaspect.mjs

import { CARD_SIZES, checkCardAspect, rectAspectRange } from '../js/keys/card.js';

let failures = 0;
function check(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`  [${mark}] ${name}${detail ? ' — ' + detail : ''}`);
}

const W = 4000, H = 3000, diag = Math.hypot(W, H);

// A card of size (long × short) lying on z = 0, centred, rotated by `yaw` in
// its plane, seen by a camera at height D, tilted `tilt` about the x axis,
// focal length f px, principal point at the image centre (plus a crop offset).
function project(size, { f, tilt = 0, yaw = 0, D = 300, crop = { x: 0, y: 0 } }) {
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const mm = [[-size.long / 2, -size.short / 2], [size.long / 2, -size.short / 2], [size.long / 2, size.short / 2], [-size.long / 2, size.short / 2]];
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  return mm.map(([x0, y0]) => {
    const x = x0 * cs - y0 * sn, y = x0 * sn + y0 * cs;
    // camera frame: rotate about x by tilt, then push back by D
    const yc = y * ct, zc = D - y * st;
    return { x: W / 2 + crop.x + f * x / zc, y: H / 2 + crop.y + f * yc / zc };
  });
}

console.log('\nthe right pick is never flagged:');
for (const key of Object.keys(CARD_SIZES)) {
  let flagged = 0, n = 0;
  for (const f of [0.5, 0.8, 1.6]) for (const tilt of [0, 0.25, 0.45]) for (const yaw of [0, 0.4]) {
    const q = project(CARD_SIZES[key], { f: f * diag, tilt, yaw });
    const r = checkCardAspect(q, W, H, key);
    n++; if (!r || r.mismatch) flagged++;
  }
  check(`${key} fits itself in all ${n} views`, flagged === 0, `${flagged} flagged`);
}

console.log('\nthe wrong pick is caught square-on, with the right suggestion:');
const cases = [
  ['poker', 'cr80'], ['cr80', 'poker'], ['half', 'cr80'], ['third', 'cr80'], ['cr100', 'half'], ['cr80', 'third'],
];
for (const [photographed, picked] of cases) {
  const q = project(CARD_SIZES[photographed], { f: 0.8 * diag, tilt: 0, yaw: 0.2 });
  const r = checkCardAspect(q, W, H, picked);
  check(`${photographed} photographed, ${picked} picked → mismatch, suggests ${photographed}`,
    r && r.mismatch && r.suggestion === photographed,
    r ? `measured ${r.measured.toFixed(3)} expected ${r.expected.toFixed(3)} range ${r.range.map(v => v.toFixed(3)).join('..')} suggestion ${r.suggestion}` : 'null');
}

console.log('\ntilted with a known focal length (EXIF): still caught, still named:');
for (const [photographed, picked] of cases) {
  const q = project(CARD_SIZES[photographed], { f: 0.8 * diag, tilt: 0.3, yaw: 0.2 });
  const r = checkCardAspect(q, W, H, picked, CARD_SIZES, { f: 0.8 * diag });
  check(`${photographed} photographed, ${picked} picked → mismatch, suggests ${photographed}`,
    r && r.mismatch && r.suggestion === photographed,
    r ? `range ${r.range.map(v => v.toFixed(3)).join('..')} suggestion ${r.suggestion}` : 'null');
}

console.log('\ntilted with an unknown camera: never a wrong name:');
for (const [photographed, picked] of cases) {
  const q = project(CARD_SIZES[photographed], { f: 0.8 * diag, tilt: 0.3, yaw: 0.2 });
  const r = checkCardAspect(q, W, H, picked);
  const ok = r && (!r.mismatch || r.suggestion === null || r.suggestion === photographed);
  check(`${photographed} photographed, ${picked} picked → ${r && r.mismatch ? 'mismatch' : 'no call'}${r && r.uncertain ? ' (uncertain)' : ''}`,
    ok, r ? `suggestion ${r.suggestion}` : 'null');
}

console.log('\nwith a known focal length the range is tight:');
{
  const q = project(CARD_SIZES.cr80, { f: 0.8 * diag, tilt: 0.3, yaw: 0.3 });
  const loose = rectAspectRange(q, W, H);
  const tight = rectAspectRange(q, W, H, { f: 0.8 * diag });
  check('EXIF focal length narrows the interval', tight.hi - tight.lo < loose.hi - loose.lo,
    `loose ${(loose.hi - loose.lo).toFixed(3)}, tight ${(tight.hi - tight.lo).toFixed(3)}`);
  check('both contain the truth', [loose, tight].every(r => r.lo <= 0.6306 && 0.6306 <= r.hi));
}

console.log('\na cropped photo still fits its own card:');
{
  const q = project(CARD_SIZES.cr80, { f: 0.8 * diag, tilt: 0.35, yaw: 0.1, crop: { x: W * 0.15, y: -H * 0.12 } });
  const r = checkCardAspect(q, W, H, 'cr80');
  check('cr80 not flagged with the principal point off-centre', r && !r.mismatch);
}

console.log('\ndegenerate input:');
check('three corners → null', checkCardAspect([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], W, H, 'cr80') === null);
check('unknown preset → null', checkCardAspect(project(CARD_SIZES.cr80, { f: diag }), W, H, 'nope') === null);

console.log(failures === 0 ? '\nAll card-aspect checks passed ✔' : `\n${failures} check(s) FAILED ✘`);
process.exit(failures === 0 ? 0 : 1);
