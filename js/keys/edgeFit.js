// Copyright (C) 2026 Projects and Mods
// GPL-3.0-or-later WITH Commons Clause (non-commercial) - see LICENSE.

// Edge-fitted card corners: refine a coarse card quad to sub-pixel precision.
// Ported from 2.5D's js/edgeFit.js (v1.28.0) and adapted to the key tool.
//
// detectCardQuad finds the card on a ~320 px downsample, so one of its pixels
// is several source pixels, and it fits each edge to hull points that sit on
// the card's rounded corners, glare and the key's own silhouette where it
// crosses the card edge. Every px/mm downstream inherits that error, and the
// cut-depth steps this tool has to resolve are 0.3 to 0.6 mm.
//
// So this walks the middle of each edge at FULL resolution instead, finds the
// card's brightness step to a fraction of a pixel on each of a few dozen
// profiles, fits one robust line per edge, and takes the corners where those
// lines cross. The corners themselves are never sampled, so a card's rounded
// corners come out right: the lines meet where the card's nominal rectangle
// has its corner, which is what its size refers to.
//
// Differences from 2.5D: the image is the tool's own full-resolution RGBA
// sample ({data, w, h}), not an <img>, so this is a pure function that runs in
// Node; a card may be darker OR brighter than the desk, so the edge polarity
// is an option (and auto-detected per edge when unknown); and there is no lens
// term, because the tool has none.
//
// It is a refinement, not a detector. It starts from the coarse quad and hands
// it back untouched whenever any edge fails to fit cleanly, so it can only make
// a detection better or leave it alone.

export const EDGE_FIT_DEFAULTS = {
  endFrac: 0.10,          // each end of an edge left unsampled (rounded corners live there)
  profiles: 96,           // profiles per edge
  halfWindowFrac: 0.012,  // search half-width, as a fraction of the image diagonal
  minHalfWindow: 8,       // px
  step: 0.5,              // px between samples along a profile
  minContrast: 18,        // luminance step (0-255) across the edge for a profile to count
  minInlierFrac: 0.4,     // of an edge's profiles
  maxRmsPx: 1.0,          // inlier RMS ceiling, px, raised for large photos by maxRmsFrac
  maxRmsFrac: 0.0006,     // of the image diagonal
  maxMoveFrac: 0.02,      // a refined corner may move this fraction of the diagonal at most
  polarity: 0,            // +1 card brighter than the desk, -1 darker, 0 decide per edge
};

const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

// Bilinear luminance at an image point. NaN outside the image.
function sampler(img) {
  const { data: d, w, h } = img;
  return (x, y) => {
    if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return NaN;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
    const ax = x - x0, ay = y - y0;
    const a = lum(d, (y0 * w + x0) * 4), b = lum(d, (y0 * w + x1) * 4);
    const c = lum(d, (y1 * w + x0) * 4), e = lum(d, (y1 * w + x1) * 4);
    return (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + e * ax) * ay;
  };
}

const median = arr => {
  if (!arr.length) return NaN;
  const s = arr.slice().sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Where a profile crosses the card's edge, as a signed offset along the
// outward normal, or null. With polarity +1 the card is the bright side and
// the edge is the steepest bright-to-dark step going outward; -1 the reverse.
// Its position is the gradient peak, refined by a parabola through its
// neighbours: under symmetric blur that peak is the 50 percent crossing, which
// is where the edge actually is.
function crossing(lumAt, px, py, nx, ny, W, o, pol) {
  const n = Math.floor((2 * W) / o.step) + 1;
  const L = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = -W + i * o.step;
    const v = lumAt(px + nx * s, py + ny * s);
    if (Number.isNaN(v)) return null;
    L[i] = v;
  }
  const k = Math.max(1, Math.round(1 / o.step));  // +/- 1 px central difference
  let best = -1, bestG = 0;
  const g = new Float64Array(n);
  for (let i = k; i < n - k; i++) {
    g[i] = pol * (L[i - k] - L[i + k]) / 2;
    if (g[i] > bestG) { bestG = g[i]; best = i; }
  }
  if (best < k + 1 || best > n - k - 2) return null;
  // The step has to be a real one: median brightness a couple of pixels either
  // side of it must differ by minContrast, which a blurred edge passes and
  // card texture, print or JPEG noise does not.
  const span = Math.round(4 / o.step), gap = Math.round(2 / o.step);
  const inside = [], outside = [];
  for (let j = best - gap - span; j <= best - gap; j++) if (j >= 0) inside.push(L[j]);
  for (let j = best + gap; j <= best + gap + span; j++) if (j < n) outside.push(L[j]);
  if (!(pol * (median(inside) - median(outside)) >= o.minContrast)) return null;
  const den = g[best - 1] - 2 * g[best] + g[best + 1];
  const off = den !== 0 ? 0.5 * (g[best - 1] - g[best + 1]) / den : 0;
  return -W + (best + Math.max(-0.5, Math.min(0.5, off))) * o.step;
}

// Theil-Sen line s = a + b t: the median of pairwise slopes, then the median
// intercept. It shrugs off up to roughly a third of outliers, which is what a
// key blade crossing the card edge or a strip of shadow produces, and it seeds
// the least-squares fit below with the right inliers.
function theilSen(ts, ss) {
  const slopes = [];
  for (let i = 0; i < ts.length; i++) {
    for (let j = i + 1; j < ts.length; j++) {
      const dt = ts[j] - ts[i];
      if (Math.abs(dt) > 1e-9) slopes.push((ss[j] - ss[i]) / dt);
    }
  }
  const b = slopes.length ? median(slopes) : 0;
  return { a: median(ss.map((s, i) => s - b * ts[i])), b };
}

// Total-least-squares line through points: centroid and direction.
function tlsLine(pts) {
  let mx = 0, my = 0;
  for (const p of pts) { mx += p.x; my += p.y; }
  mx /= pts.length; my /= pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    const ax = p.x - mx, ay = p.y - my;
    sxx += ax * ax; syy += ay * ay; sxy += ax * ay;
  }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dx = Math.cos(th), dy = Math.sin(th);
  let ss = 0;
  for (const p of pts) { const d = (p.x - mx) * -dy + (p.y - my) * dx; ss += d * d; }
  return { mx, my, dx, dy, rms: Math.sqrt(ss / pts.length) };
}

function intersect(l1, l2) {
  const den = l1.dx * l2.dy - l1.dy * l2.dx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((l2.mx - l1.mx) * l2.dy - (l2.my - l1.my) * l2.dx) / den;
  return { x: l1.mx + l1.dx * t, y: l1.my + l1.dy * t };
}

function convex(q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-9) return false;
    if (!sign) sign = Math.sign(z); else if (Math.sign(z) !== sign) return false;
  }
  return true;
}

// Sample the crossings along one edge for a given polarity.
function edgeCrossings(lumAt, a, ex, ey, nx, ny, W, o, pol) {
  const pts = [], ts = [];
  for (let i = 0; i < o.profiles; i++) {
    const t = o.endFrac + (1 - 2 * o.endFrac) * (i + 0.5) / o.profiles;
    const px = a.x + ex * t, py = a.y + ey * t;
    const s = crossing(lumAt, px, py, nx, ny, W, o, pol);
    if (s === null) continue;
    pts.push({ x: px + nx * s, y: py + ny * s });
    ts.push(t);
  }
  return { pts, ts };
}

// Refine corners ordered around the quad (TL, TR, BR, BL as detectCardQuad
// gives them), in image pixels of `img` ({data, w, h}, RGBA).
// Returns { ok, corners, edges, moved, reason, polarity }. When ok is false,
// corners is the input, untouched.
export function refineCorners(img, corners, opts = {}) {
  const o = { ...EDGE_FIT_DEFAULTS, ...opts };
  const fail = (reason, edges) => ({ ok: false, corners, edges: edges || [], moved: 0, reason, polarity: o.polarity });
  if (!img || !img.data || !corners || corners.length !== 4) return fail('no corners');
  const iw = img.w, ih = img.h;
  const diag = Math.hypot(iw, ih);
  const W = Math.max(o.minHalfWindow, o.halfWindowFrac * diag);
  const cx = corners.reduce((s, p) => s + p.x, 0) / 4;
  const cy = corners.reduce((s, p) => s + p.y, 0) / 4;
  const maxRms = Math.max(o.maxRmsPx, o.maxRmsFrac * diag);
  const lumAt = sampler(img);
  const need = Math.max(12, Math.ceil(o.minInlierFrac * o.profiles));

  const lines = [], edges = [];
  let polarity = o.polarity;
  for (let e = 0; e < 4; e++) {
    const a = corners[e], b = corners[(e + 1) % 4];
    const ex = b.x - a.x, ey = b.y - a.y, len = Math.hypot(ex, ey);
    if (len < 8 * W) return fail(`edge ${e} too short to fit`, edges);
    let nx = -ey / len, ny = ex / len;
    if (((a.x + b.x) / 2 - cx) * nx + ((a.y + b.y) / 2 - cy) * ny < 0) { nx = -nx; ny = -ny; }

    let found;
    if (polarity) {
      found = edgeCrossings(lumAt, a, ex, ey, nx, ny, W, o, polarity);
    } else {
      // Unknown polarity: whichever direction the step goes on most profiles.
      const up = edgeCrossings(lumAt, a, ex, ey, nx, ny, W, o, 1);
      const dn = edgeCrossings(lumAt, a, ex, ey, nx, ny, W, o, -1);
      found = up.pts.length >= dn.pts.length ? up : dn;
      if (found.pts.length >= need) polarity = found === up ? 1 : -1;
    }
    const { pts } = found;
    if (pts.length < need) {
      edges.push({ total: o.profiles, found: pts.length, inliers: 0, rms: null });
      return fail(`edge ${e}: the card's edge was found on only ${pts.length} of ${o.profiles} profiles`, edges);
    }

    // Offsets from the coarse edge, so the robust seed works in a frame where
    // the true edge is a straight, nearly flat line.
    const ux = ex / len, uy = ey / len;
    const along = pts.map(p => (p.x - a.x) * ux + (p.y - a.y) * uy);
    const off = pts.map(p => (p.x - a.x) * -uy + (p.y - a.y) * ux);
    const seed = theilSen(along, off);
    const res = off.map((s, i) => s - (seed.a + seed.b * along[i]));
    const sigma = 1.4826 * median(res.map(Math.abs));
    const thr = Math.max(1, 3 * sigma);
    let inl = pts.filter((_, i) => Math.abs(res[i]) <= thr);
    if (inl.length < 2) return fail(`edge ${e}: no agreeing profiles`, edges);
    let line = tlsLine(inl);
    // Two passes of trimming against the fitted line itself.
    for (let pass = 0; pass < 2; pass++) {
      const d = pts.map(p => Math.abs((p.x - line.mx) * -line.dy + (p.y - line.my) * line.dx));
      const s2 = 1.4826 * median(d);
      const t2 = Math.max(1, 3 * s2);
      const next = pts.filter((_, i) => d[i] <= t2);
      if (next.length < need) break;
      inl = next;
      line = tlsLine(inl);
    }
    edges.push({ total: o.profiles, found: pts.length, inliers: inl.length, rms: line.rms });
    if (inl.length < need) return fail(`edge ${e}: only ${inl.length} profiles agree on a line`, edges);
    if (line.rms > maxRms) return fail(`edge ${e}: too ragged to trust (${line.rms.toFixed(2)} px RMS)`, edges);
    lines.push(line);
  }

  // Corner i is where the edge ending at it meets the edge starting at it.
  const out = [];
  for (let i = 0; i < 4; i++) {
    const p = intersect(lines[(i + 3) % 4], lines[i]);
    if (!p) return fail('two edges are parallel', edges);
    out.push(p);
  }
  if (!convex(out)) return fail('the fitted corners do not form a convex quad', edges);
  let moved = 0;
  for (let i = 0; i < 4; i++) moved = Math.max(moved, Math.hypot(out[i].x - corners[i].x, out[i].y - corners[i].y));
  if (moved > o.maxMoveFrac * diag) {
    return fail(`a fitted corner moved ${moved.toFixed(1)} px, too far from the detection to trust`, edges);
  }
  return { ok: true, corners: out, edges, moved, reason: null, polarity };
}
