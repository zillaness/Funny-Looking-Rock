// Copyright (C) 2026 Projects and Mods
// GPL-3.0-or-later WITH Commons Clause (non-commercial) - see LICENSE.

// The reference rectangles, and the check that the one in the photo is the one
// the person picked. The aspect check is ported from 2.5D's js/paperAspect.js
// (v1.30) without its lens term.
//
// Standard ID-card-family rectangles (mm). The known real dimensions are what
// let the four corners correct scale AND perspective skew (homography), so a
// wrong pick scales the whole key: a playing card read as a CR80 comes out
// 3.7 percent short along the blade, which is a whole depth step on Schlage.
export const CARD_SIZES = {
  cr80:  { long: 85.60, short: 53.98, name: 'CR80 credit / ID card' },
  cr79:  { long: 83.90, short: 51.00, name: 'CR79 insert card' },
  cr100: { long: 98.50, short: 67.00, name: 'CR100 oversized badge' },
  poker: { long: 88.90, short: 63.50, name: 'playing / trading card' },
  half:  { long: 53.98, short: 42.80, name: '½ CR80 key tag' },
  third: { long: 53.98, short: 28.53, name: '⅓ CR80 key tag' },
};

// Nothing used to check the pick. Absolute size cannot be read from one photo,
// but proportions can. From straight above, a rectangle's image keeps its
// proportions; tilted, it foreshortens. Zhang and He's whiteboard-scanning
// construction recovers the true proportions from the four corners given the
// camera's focal length. The same construction can also estimate the focal
// length, but not always: tip the phone about one axis only, the commonest
// tilt there is, and one pair of the card's edges stays parallel in the photo,
// which leaves the focal length undetermined. So this does not guess one. It
// computes the proportions over every plausible focal length and, in case the
// photo was cropped, every plausible principal point, and warns only when the
// selected card fits none of them. The guarantee that matters: a card of the
// right size is never flagged.

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const fold = r => (r > 1 ? 1 / r : r);

// Plausible focal lengths without EXIF, as multiples of the image diagonal: a
// phone's wide lens is about 0.6, its 3x about 1.8.
export const FOCAL_RANGE = [0.4, 2.2];
// The photo may have been cropped, which moves the principal point off the
// image centre. It is allowed anywhere in the middle 40 percent of the frame.
export const PP_SPAN = 0.2;
const FOCAL_EXIF_SLACK = 0.08;   // EXIF rounds to whole millimetres and crops vary
const CORNER_SLACK = 0.02;       // proportions error from corner placement
const SUGGEST_MAX_WIDTH = 0.08;  // name a preset only when the interval is this narrow

// Short side over long side of a rectangle seen at four photo corners, for one
// assumed camera: principal point (u0, v0), focal lengths f0 to f1. Zhang and
// He's construction; w/h at focal length f is a ratio of two linear functions
// of f^2, so it is monotonic in f and its extremes sit at the range's ends.
function foldedRange(c, u0, v0, f0, f1) {
  const h = p => [p.x - u0, p.y - v0, 1];
  // Zhang and He name the rectangle's corners (0,0), (w,0), (0,h), (w,h).
  const m1 = h(c[0]), m2 = h(c[1]), m3 = h(c[3]), m4 = h(c[2]);
  const c14 = cross(m1, m4);
  const d2 = dot(cross(m2, m4), m3), d3 = dot(cross(m3, m4), m2);
  if (Math.abs(d2) < 1e-12 || Math.abs(d3) < 1e-12) return null;
  const k2r = dot(c14, m3) / d2, k3r = dot(c14, m2) / d3;
  const n2 = [k2r * m2[0] - m1[0], k2r * m2[1] - m1[1], k2r * m2[2] - m1[2]];
  const n3 = [k3r * m3[0] - m1[0], k3r * m3[1] - m1[1], k3r * m3[2] - m1[2]];
  const at = f => Math.sqrt((n2[0] * n2[0] + n2[1] * n2[1] + f * f * n2[2] * n2[2]) /
    (n3[0] * n3[0] + n3[1] * n3[1] + f * f * n3[2] * n3[2]));
  const a = at(f0), b = at(f1);
  if (!(a > 0 && b > 0)) return null;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  // Folded to short over long. Straddling 1 makes the fold non-monotonic, and
  // then the folded set runs up to 1 itself.
  if (hi <= 1) return [lo, hi];
  if (lo >= 1) return [1 / hi, 1 / lo];
  return [Math.min(lo, 1 / hi), 1];
}

// The rectangle's short-over-long proportions, as an interval over every
// camera the photo could have come from. opts.f is a trusted focal length in
// pixels (EXIF, on an uncropped photo): then the principal point is the image
// centre and the focal length is pinned to within EXIF's rounding. Without it,
// both range over their plausible sets.
// Returns { lo, hi, mid, known } or null for a degenerate quad.
export function rectAspectRange(corners, imgW, imgH, opts = {}) {
  if (!corners || corners.length !== 4) return null;
  const c = corners;
  const diag = Math.hypot(imgW, imgH);
  const known = opts.f > 0;
  const fm = known ? opts.f : 0.6 * diag;
  const mid = foldedRange(c, imgW / 2, imgH / 2, fm, fm);
  let lo = Infinity, hi = -Infinity;
  const take = r => { if (r) { lo = Math.min(lo, r[0]); hi = Math.max(hi, r[1]); } };
  if (known) {
    take(foldedRange(c, imgW / 2, imgH / 2, opts.f * (1 - FOCAL_EXIF_SLACK), opts.f * (1 + FOCAL_EXIF_SLACK)));
  } else {
    const N = 5;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const u0 = imgW * (0.5 + PP_SPAN * (2 * i / (N - 1) - 1));
        const v0 = imgH * (0.5 + PP_SPAN * (2 * j / (N - 1) - 1));
        take(foldedRange(c, u0, v0, FOCAL_RANGE[0] * diag, FOCAL_RANGE[1] * diag));
      }
    }
  }
  if (!(lo <= hi) || !mid) {
    const affine = (dist(c[0], c[1]) + dist(c[3], c[2])) / (dist(c[0], c[3]) + dist(c[1], c[2]));
    const s = fold(affine);
    return { lo: s, hi: s, mid: s, known };
  }
  return { lo, hi, mid: mid[0], known };
}

// Where to look for a better match, most common first.
const PREFER = ['cr80', 'poker', 'half', 'third', 'cr100', 'cr79'];

// Compare the photographed proportions with the selected card. Returns
// { measured, expected, range, mismatch, suggestion, known, uncertain } or null.
// A suggestion is only named when the interval is narrow enough to point at
// one preset (square-on, or a known focal length); on a tilted photo of
// unknown camera the mismatch is still reported but `uncertain` is set and no
// preset is named, because several would fit.
// CR79 and CR80 differ by under 4 percent, which this cannot tell apart on an
// untilted photo of unknown camera, so a CR79 never flags a CR80 pick or the
// reverse; the presets it does catch are the ones a whole depth step apart.
export function checkCardAspect(corners, imgW, imgH, sizeKey, sizes = CARD_SIZES, opts = {}) {
  const sel = sizes[sizeKey];
  if (!sel) return null;
  const r = rectAspectRange(corners, imgW, imgH, opts);
  if (!r) return null;
  const lo = r.lo * (1 - CORNER_SLACK), hi = Math.min(1, r.hi * (1 + CORNER_SLACK));
  const fits = ratio => ratio >= lo && ratio <= hi;
  const expected = sel.short / sel.long;
  const uncertain = hi - lo > SUGGEST_MAX_WIDTH;
  const out = { measured: r.mid, expected, range: [lo, hi], known: r.known, uncertain };
  if (fits(expected)) return { ...out, mismatch: false, suggestion: null };
  let suggestion = null;
  if (!uncertain) {
    for (const k of PREFER.concat(Object.keys(sizes).filter(k => !PREFER.includes(k)))) {
      const s = sizes[k];
      if (!s || k === sizeKey) continue;
      if (fits(s.short / s.long)) { suggestion = k; break; }
    }
  }
  return { ...out, mismatch: true, suggestion };
}
