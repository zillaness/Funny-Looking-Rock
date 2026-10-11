---
file: funny_looking_rock_split_prd_v1.1.md
version: 1.1
author: Sam Cao
created: 2026-10-07
last_updated: 2026-10-11
description: Findings on the state of the 2.5D repository and a PRD for moving Funny Looking Rock into its own repository, with the 2.5D features worth porting across.
ai_update: Update last_updated and version. Rename file to match. Append changelog at bottom.
---

# Funny Looking Rock: move to its own repository

Status: DONE (2026-10-11). Signed off by Sam on 2026-10-11 with the decisions
recorded under "Decisions and outcome" at the end; the move, the Pages
switch, and feature ports 1 to 3 are all shipped.

## Part 1. What is going on with 2.5D

### Branches

| Branch | What it is | Head | Last commit |
|---|---|---|---|
| `claude/2.5d-photo-stl-s3-y0oodn` | The real 2.5D mainline. v1.33.3. 233 commits, 211 since the fork point. Deployed to Pages as `2.5d.html`. | `641e9be` | 2026-10-02 |
| `claude/object-thickness-photo-t8mw2k` | **GitHub default branch.** 2.5D v1.10.x. Stale by 23 minor versions. | `80d4a60` | 2026-07-31 |
| `claude/key-from-photo` | Funny Looking Rock v5.3 on top of a frozen 2.5D v1.4.0. 118 commits. This is what `claude/bold-goodall-pxogly` was checked out from. | `a0edc37` | 2026-07-28 |
| `claude/blueprint-seed` | PDF/CAD-drawing import fork. Separate direction, untouched since July. | `ddcdc22` | 2026-07-22 |
| `claude/readme-screenshots`, `archive/v1.10.x-readme-screenshots` | Both equal the default branch head. | `80d4a60` | 2026-07-31 |
| `gh-pages` | Deployed site. | `ca8f524` | 2026-10-02 |

There is no `main`. The fork point of the key work is `5d6b90e` (2026-07-21, "Tangent-fillet corner cleanup").

### Findings

1. **The default branch is stale.** GitHub points at v1.10.x while the mainline is v1.33.3 on the s3 branch. Anyone landing on the repo sees July code. This is a Settings change only you can make.
2. **The 2.5D Pages root serves Funny Looking Rock, not 2.5D.** On `gh-pages`, `index.html` and `FunnyLookingRock/index.html` are both FLR v5.3 and `2.5d.html` is 2.5D v1.33.3. The branded URL is `zillaness.github.io/2.5D/FunnyLookingRock/`.
3. **The 2.5D mainline already contains zero key code.** The s3 branch has no `js/keys/`, no `keys.html`, no `css/keys.css`, and its `build.mjs` has no FLR section. The separation on the 2.5D side is already complete. The split is therefore "the key branch becomes the new repo", not a surgical extraction.
4. **The key branch has nothing 2.5D needs back.** Every 2.5D-side file on the key branch differs from the fork point only by the per-file license header commit (`8d3564b`). No 2.5D bug fixes are trapped there. One small exception: the mainline never got those per-file headers (its `js/version.js` has none). Cosmetic.
5. **The key tool's dependency on 2.5D code is small.** `keyUI.js` imports only `js/viewer3d.js` and `js/exporters.js` (just `toBinarySTL` and `downloadBlob`), `keyMesh.js` imports `vendor/earcut.js`, and the page uses `css/style.css` plus `vendor/three.module.min.js` and `OrbitControls.js`. Everything else in the key branch's 2.5D copy is dead weight for FLR. The key tool has its own card detection, homography, and loupe inside `keyUI.js`.
6. **Flow so far has been FLR to 2.5D, not the reverse.** 2.5D's `js/text.js` is a port of FLR's `textpath.js` (the header says so). The three-state theme shipped in FLR v5.3 and 2.5D v1.18.1 on the same day.
7. **The s3 README still lists "Keys" under Horizon as unbuilt work.** Stale; it should point at the new repo.
8. **The decisions doc already asked for this.** `docs/key-from-photo-decisions.md` has a TODO: "give Funny Looking Rock its own repo so the URL is `.../FunnyLookingRock/` at the top level". The target repo `zillaness/Funny-Looking-Rock` exists on GitHub and is empty (no commits, no default branch).

## Part 2. Features FLR should take from 2.5D v1.4 to v1.33

Framing: the key tool's whole accuracy budget rides on px/mm from a card. Cut-depth steps are 0.32 mm (BEST), 0.38 mm (Schlage), 0.39 mm (Master), 0.58 mm (Kwikset). Anything that tightens scale or catches a wrong reference pays directly. Anything about drawers, nesting, and layout does not apply.

| # | Feature (2.5D module, version) | Why it matters for keys | Effort | Call |
|---|---|---|---|---|
| 1 | **Edge-fitted sub-pixel corners** (`js/edgeFit.js`, v1.28.0) | FLR's `detectCardQuad` runs on a ~320 px downsample then fits lines. edgeFit walks each edge at full resolution, fits a robust line per edge, and intersects. Built explicitly to handle rounded card corners. Pure module, no DOM. | Small | **Take** |
| 2 | **Reference aspect check** (`js/paperAspect.js`, v1.30.x) | FLR has 6 reference presets (CR80, CR79, CR100, half and third key tags, playing card). Pick the wrong one and the key scales silently. This module reads the rectangle's true proportions from the four corners and says when the preset does not match. Pure module. | Small | **Take** |
| 3 | **Shipped-bundle smoke test** (`test/dist-smoke.mjs`, v1.25.x) | Loads `dist/` from `file://` and fails on any page error. FLR's bundle is exactly the class that breaks only when bundled: inlined Manifold WASM, `node:` stubs, `import.meta.url` define. None of the 9 current checks load the dist. | Trivial | **Take** |
| 4 | **Parallax / top-plane rectification** (`js/exif.js`, `js/parallax.js`, v1.33.x) | A blade sits 1 to 2 mm above the card plane (card 0.76 mm, blade 1.9 to 2.0 mm). At 25 to 30 cm phone distance that is 0.4 to 0.8 percent scale error, about 0.1 to 0.2 mm across a blade and a depth bias. Borderline against the 0.32 mm BEST step. Needs the JPEG focal length, which FLR's canvas pipeline would have to preserve. | Medium | **Consider after 1 and 2** |
| 5 | **Calibration sheet** (`calibSheet/Detect/Find/Fit/Verdict`, v1.30 to v1.32) | A printed matte frame with a code track beats a glossy rounded card for detection, and it self-verifies printer scale. But it is 6 modules plus frozen fixtures, sized for Letter/A4; a key-sized sheet would be a new layout version. | Large | **Not now.** Revisit if card detection is still the weak point after 1. |
| 6 | **Lens distortion** (`js/lens.js`, pre-fork v1.3.0, never adopted by FLR) | Keys sit near image centre where radial distortion is smallest. | Small | Skip |
| 7 | **Label legibility by process** (v1.24 to v1.25) | FLR already warns when the bow label barely fits. 2.5D's per-process minimum cap height could tighten that into a real FDM floor. | Small | Skip for now |
| 8 | Nesting, drawer scan, holders, batch ingest, layout editor, several-sheet calibration, README screenshot automation | Not a key problem. | | Skip |

Recommendation: port 1, 2, 3 as the first three commits in the new repo after the move. Decide 4 after seeing what 1 and 2 do to measured depth repeatability.

## Part 3. PRD for the move

### Problem

Funny Looking Rock is a branch of 2.5D. Its code depends on a July snapshot of 2.5D that it uses almost none of. Its URL lives under `/2.5D/`. The 2.5D repo's Pages root shows the key tool instead of 2.5D. The mainline 2.5D has moved 211 commits without it. The decisions doc has carried a TODO for the split since July.

### Success criteria

- `zillaness/Funny-Looking-Rock` contains the key tool, builds with `node build.mjs`, and all key checks pass in a fresh clone after `npm install`.
- The repo contains no 2.5D application code, only the three shared modules and the vendored libraries FLR actually uses.
- Git history for every FLR file is preserved (blame works).
- The branded URL keeps working: the old `/2.5D/FunnyLookingRock/` address lands on the new site.
- The 2.5D repo's Pages root serves 2.5D.
- 2.5D's README stops listing Keys as future work and links to the new repo.

### Scope

**Moves into the new repo (kept from the key branch):**
`keys.html`, `css/keys.css`, `css/style.css`, `js/keys/**`, `js/viewer3d.js`, `js/exporters.js`, `vendor/{three.module.min.js, OrbitControls.js, earcut.js, LICENSE-three, LICENSE-earcut}`, `test/{keys,decode,keymesh_check,keyui_smoke,orient_smoke,bowdetect_smoke,rectify_smoke}.mjs`, `tools/keycheck.mjs`, `scripts/extract-warding.mjs`, `docs/{spec-key-from-photo.md, key-from-photo-decisions.md, dev-environment.md, key-refs/**}`, `dist/funny-looking-rock.html`, `dist/funny-looking-rock.fragment.html`, `LICENSE`, `LICENSE-ASSETS`, `LICENSING.md`, `.gitignore`.

**Rewritten for the new repo:** `README.md` (currently 2.5D's; becomes FLR's), `package.json` (name, description, scripts trimmed to the key checks plus `smoke`), `build.mjs` (FLR section only; the embedded "source + LICENSE: github.com/zillaness/2.5D" comment points at the new repo).

**Removed from the new repo (2.5D-only):** `index.html`, `js/main.js`, `js/ui/**`, `js/import/**`, `js/{homography,detectPaper,segment,contour,mesh,lens,measure,constraints,screws,paperSizes,units,version}.js`, `vendor/clipper.js`, `test/e2e.mjs`, `dist/2.5d-local.html`, `docs/cad-import*`, `docs/step*.png`, `docs/coin-mode.png`.

**Changes to the 2.5D repo (after the new repo is verified):**
- `gh-pages`: `FunnyLookingRock/index.html` becomes a redirect to the new Pages URL. Root `index.html` becomes 2.5D (today's `2.5d.html`). `2.5d.html` stays as a redirect so the link baked into FLR v5.3 (`keys.html` line 25) keeps working.
- s3 README Horizon: replace the Keys bullet with a pointer to the new repo.
- `claude/key-from-photo`: rename to `archive/key-from-photo` or delete. Your call (see open questions).

**Out of scope:** porting the features in Part 2 (separate commits after the move), changing the 2.5D default branch (Settings, yours), enabling Pages on the new repo (Settings, yours).

### Constraints

- GPL-3.0-or-later WITH Commons Clause carries over unchanged. The repo is a fork, and keeping full history is the cleanest way to preserve attribution.
- `docs/key-refs/` is 13 MB and includes third-party manufacturer PDFs (Framon manual, Master Lock 7000-0031, Thomas bitting specifications) and a Kwikset STEP/F3D. They are already public in 2.5D, so moving them adds no new exposure, but a new public repo is a fresh act of publishing. Default is to keep them (the docs reference them by page). Flagged for a conscious call.
- `docs/key-refs/Funny Looking Rock Favicon Icon.png` is an original asset under CC BY-NC-SA, not a reference. It should move to `docs/` proper.
- Never commit the user's key photo or real key STL (existing rule, carries over).
- No GitHub Actions in either repo; deploy stays a manual build-and-copy to `gh-pages`.

### Plan

1. **History.** Push the key branch's full history to the new repo as-is (option A below). This preserves blame for every FLR file and the GPL attribution chain. One follow-up commit prunes the 2.5D-only files listed above.
2. **Rewrite** `README.md`, `package.json`, `build.mjs`. Move the favicon out of `key-refs/`. Add a `docs/` copy of this PRD.
3. **Verify** in the new checkout: `npm install`, the 7 key checks, `tools/keycheck.mjs all`, `node build.mjs`, then a `dist-smoke` adapted to FLR (Part 2 item 3, pulled forward because it is the verification step).
4. **Push** to `claude/bold-goodall-pxogly` on `Funny-Looking-Rock` as instructed. See open question 1 on `main`.
5. **Deploy.** Create `gh-pages` on the new repo with `index.html` = `dist/funny-looking-rock.html`. You enable Pages in Settings. Then switch the 2.5D `gh-pages` root and redirects as above.
6. **2.5D cleanup.** README Horizon bullet on the s3 branch. Branch archive or delete per your call.
7. **Then** port Part 2 items 1 to 3.

### History options considered

- **A. Push full history, then prune (recommended).** Honest fork, blame intact, zero risk of losing anything. Cost: the repo carries 2.5D's pre-fork history and the 13 MB of key-refs plus old dist blobs.
- **B. Rewrite history to FLR paths only (`git filter-branch` or `filter-repo`).** Smaller, but rewritten hashes, and the shared files' history is partly lost. Needs a tool that may not install through the proxy.
- **C. Single snapshot commit.** No history, no blame. Loses the record of why every blank and warding decision was made.

### Open questions

1. **Default branch of the new repo.** The first branch pushed to an empty repo becomes its default. Instructions say push to `claude/bold-goodall-pxogly`. Do you want me to also push `main` so the repo starts on a conventional default? That needs your explicit permission.
2. **History.** Option A, B, or C.
3. **Third-party PDFs in `docs/key-refs/`.** Keep as-is (default), or move them out of the public repo.
4. **The old branch.** Rename `claude/key-from-photo` to `archive/key-from-photo`, delete it, or leave it. Deleting is the one step here that is hard to undo.
5. **2.5D Pages root.** Switch it to 2.5D and leave redirects at `/FunnyLookingRock/` and `/2.5d.html` (default), or leave 2.5D's Pages alone entirely.
6. **Feature ports.** Approve Part 2 items 1 to 3 as the first work in the new repo, or hold.

## Decisions and outcome (2026-10-11)

Answers to the open questions, and what was done:

1. **Default branch:** `main`, pushed alongside the session branch
   `claude/bold-goodall-pxogly` (same commit). Both repos are public.
2. **History:** option A. The full `claude/key-from-photo` history is in this
   repo; commit `f577ff8` is the prune.
3. **Third-party PDFs:** kept, status quo.
4. **Old branch:** `archive/key-from-photo` now exists on 2.5D at the same
   commit. Deleting `claude/key-from-photo` was refused by the session's git
   proxy (HTTP 403 on ref deletion), so it is still there; delete it on
   GitHub when convenient. Nothing references it any more.
5. **2.5D Pages:** root is 2.5D v1.33.3; `/FunnyLookingRock/` and `/2.5d.html`
   are redirects (gh-pages `e9f7815`).
6. **Feature ports:** all three shipped in v5.4 (`60a8926`): `js/keys/edgeFit.js`,
   `js/keys/card.js`, `test/dist-smoke.mjs`. Parallax (item 4) stays open;
   decide after real-photo depth repeatability is measured with 1 and 2 in.

Also done: this repo's `gh-pages` carries v5.4 (`3533939`); the 2.5D README fix
is on 2.5D's `claude/bold-goodall-pxogly` (`2dc7d4c`, off the s3 mainline) for
Sam to merge. Still Sam's to do in GitHub Settings: enable Pages on this repo
(branch `gh-pages`, root) if it did not switch on by itself, and make the s3
branch 2.5D's default.

## CHANGELOG

- v1.0 (2026-10-07): Initial draft. Findings on 2.5D branch state, feature-port assessment, and move PRD.
- v1.1 (2026-10-11): Signed off and executed. Decisions and outcome recorded; status DONE.
