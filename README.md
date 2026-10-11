<!-- Copyright (C) 2026 Projects and Mods -->
<!-- GPL-3.0-or-later WITH Commons Clause (non-commercial) - see LICENSE. -->

# Funny Looking Rock — photograph a key → print a spare

Lay a house key flat on a credit card, photograph it from above, and get a
3D-printable STL of a spare back. The app reads the **bitting** (the cut
depths along the blade) off the photo, snaps each cut to the manufacturer's
standard depth-and-spacing so you get a clean code, and builds the key from
the real warded cross-section of the blank you picked.

The card is the trick: its size is known (ISO 7810 ID-1, 85.60 × 53.98 mm),
so its four corners give a homography that removes perspective skew and sets
true scale. Keys are small, so a card is the right reference where 2.5D uses a
sheet of paper.

Everything runs in the browser. No server, no uploads — your key photo never
leaves your machine, and the repo never carries one.

**Live:** https://zillaness.github.io/Funny-Looking-Rock/

> Duplicate only keys you own or are explicitly authorized to copy, the same
> rule a locksmith follows. And keep ID badges and key tags out of the photo:
> a picture that shows both a key and where it opens is a real security risk.

## Running it

**No hosting needed** — grab [`dist/funny-looking-rock.html`](dist/funny-looking-rock.html)
(one self-contained ~1.4 MB file, everything inlined including the CSG engine)
and double-click it. Rebuild it after source changes with `npm run build`.

For development the un-bundled source needs a static server (browsers block
ES modules over `file://`):

```sh
npm install                     # esbuild, playwright-core, manifold-3d
python3 -m http.server 8000     # or: npx serve .
# open http://localhost:8000/keys.html
```

## Workflow

**1 — Photo & card.** Pick the **key blank** (Kwikset KW1, Schlage SC1 / SC4,
Master Lock M1, BEST A2; Schlage also offers its C-family keyway sections).
Load the photo, orient it with Rotate / Mirror / Flip, and set the scale from
the card: **Set scale** auto-detects the card (Otsu threshold, convex extreme
corners, lines fitted to the straight edges so rounded corners don't matter)
and you drag the edges to fine-tune, with a magnifier loupe while dragging.
Six reference presets: CR80, CR79, CR100, ½ and ⅓ CR80 key tags, and a
playing card. The card is optional — square-on with no card, scale comes from
the known cut spacing. Advancing with a card set **warps the photo flat**
through the card homography so tracing runs on a true-millimetre image.

**2 — Trace the cuts.** The bow is found from the silhouette (the keyring
hole, else the wide end by PCA) so the reading direction sets itself, bow→tip.
A green **back-edge** line is the depth datum; one red handle per cut sits in
each valley. Red means it snapped cleanly to a standard depth, orange means it
is between two. The decoded code shows live with a **MACS** check (maximum
adjacent cut specification), and a Flip button reverses the reading. Know the
code already? Type it and skip the photo.

**3 — 3D key.** Generate builds the key: the blade is the blank's real
**paracentric warding** extruded along the bitting, with the keyway-specific
tip nose and shoulder fillet; the bow is the real keygen outline with its
keyring hole(s); the two are joined by a true CSG union (Manifold, WASM,
bundled). Optionally engrave or raise a short **label** or the bitting code on
the bow, oriented for a keyring or a retractor. Export a binary STL and print
it flat on the bed in PETG, nylon or resin — a spare, not a daily key.

## How it works

- `js/keys/blanks.js` — the blank library: verified depth-and-spacing (root
  depths, spacing, MACS) for KW1, SC1, SC4, M1 and BEST A2, cross-checked
  against the charts in `docs/key-refs/`.
- `js/keys/warding.js` — keyway cross-sections (Schlage C-family, Kwikset KW1,
  Master K1) extracted from [ervanalb/keygen](https://github.com/ervanalb/keygen)
  (CC0) by `scripts/extract-warding.mjs`.
- `js/keys/decode.js`, `js/keys/bitting.js` — edge profile → valleys → snapped
  code, MACS, and the inverse (code → profile).
- `js/keys/keyMesh.js` — the watertight key: warded blade loft, bitting carve,
  bow with holes, CSG union through `manifold-loader.js`, plus a synchronous
  welded fallback if the engine fails to load.
- `js/keys/textpath.js` — label text → polygon loops (platform font, marching
  squares), the module 2.5D later ported as its `text.js`.
- `js/keys/keyUI.js` — the wizard, card detection, homography, loupe, bow
  detection.
- `js/viewer3d.js`, `js/exporters.js`, `css/style.css`, `vendor/` — the three
  files and three libraries (three.js, OrbitControls, earcut) this app shares
  with 2.5D, vendored here.

Conventions that matter: this app numbers cuts **bow→tip**. keygen does the
same for Schlage, so codes transfer directly; BEST/SFIC is specified tip→bow,
so reverse BEST codes when moving to or from a BEST spec sheet.

## Tests

```sh
npm test               # decode, blanks/bitting/warding, CSG mesh, geometry checker
npm run test:browser   # wizard UI, orientation, bow detection, skew correction
npm run smoke          # rebuild, then load the shipped bundle from file://
```

The browser tests drive a headless Chromium through `playwright-core`; see
[`docs/dev-environment.md`](docs/dev-environment.md) for Chromium discovery
and the full check roster. `npm install` is not optional in a fresh clone.

## Docs

- [`docs/spec-key-from-photo.md`](docs/spec-key-from-photo.md) — the original spec.
- [`docs/key-from-photo-decisions.md`](docs/key-from-photo-decisions.md) — running
  log of product and data decisions, deployment, and what's done.
- [`docs/key-refs/`](docs/key-refs/) — reference charts, the pull list, and the
  cabinet / wafer key plan (`WAFER-CABINET-KEYS.md`).
- [`docs/funny_looking_rock_split_prd_v1.0.md`](docs/funny_looking_rock_split_prd_v1.0.md) —
  why and how this repo was split out of 2.5D, and the 2.5D features queued to port.

## Relationship to 2.5D

Funny Looking Rock began as a fork of [2.5D](https://github.com/zillaness/2.5D),
the general photo → traced outline → printable solid tool, and was split into
its own repository on 2026-10-11 with full history. The pipelines no longer
share code at runtime; improvements move between them by porting.

## License

- **Code:** [GPL-3.0-or-later WITH the Commons Clause](LICENSE) — non-commercial,
  source-available. You may use, modify, and share the source (modifications stay
  under the same terms), but may **not Sell** the Software.
- **Artwork & diagrams:** [CC BY-NC-SA 4.0](LICENSE-ASSETS) — © Projects and Mods.

Third-party and reference material keeps its own license: keygen output is CC0;
manufacturer charts and models in `docs/key-refs/` keep their own terms. See
[`LICENSING.md`](LICENSING.md).
