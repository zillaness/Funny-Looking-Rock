// Copyright (C) 2026 Projects and Mods
// GPL-3.0-or-later WITH Commons Clause (non-commercial) - see LICENSE.

// Bundle Funny Looking Rock into one self-contained HTML file that works from
// file:// — just double-click it. No hosting, no build tools needed by the
// person you send it to.
//
//   node build.mjs      -> dist/funny-looking-rock.html
//                          dist/funny-looking-rock.fragment.html (body only,
//                          for publishing as an artifact)

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const root = path.dirname(fileURLToPath(import.meta.url));
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const SOURCE = 'github.com/zillaness/Funny-Looking-Rock';

// The Manifold CSG engine (WASM) does the bow↔blade boolean union. Its Emscripten
// glue references node: builtins on a Node-only branch (stub them for the
// browser) and derives a script dir from import.meta.url (define a valid URL).
const stubNode = {
  name: 'stub-node',
  setup(b) {
    b.onResolve({ filter: /^node:/ }, (a) => ({ path: a.path, namespace: 'node-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'node-stub' },
      () => ({ contents: 'export default {}; export const createRequire = () => (() => ({}));', loader: 'js' }));
  },
};
const keyBundle = (await esbuild.build({
  entryPoints: [path.join(root, 'js/keys/keyUI.js')],
  bundle: true, minify: true, format: 'iife',
  alias: { three: path.join(root, 'vendor/three.module.min.js') },
  plugins: [stubNode],
  define: { 'import.meta.url': JSON.stringify('file:///funny-looking-rock.html') },
  write: false, logLevel: 'silent',
})).outputFiles[0].text;

// Inline the Manifold wasm as base64 so the app stays a single file that runs
// from file:// (nothing to fetch). keyUI reads window.__FLR_MANIFOLD_WASM.
const wasmB64 = fs.readFileSync(path.join(root, 'node_modules/manifold-3d/manifold.wasm')).toString('base64');
const wasmScript = `<script>window.__FLR_MANIFOLD_WASM=${JSON.stringify(wasmB64)};</script>\n`;

const css = read('css/style.css') + '\n' + read('css/keys.css');

// Body markup from keys.html, minus the importmap and module script that the
// bundle replaces. (The <link>/<script> tags in <head> are outside the slice.)
const keyHtml = read('keys.html');
const keyBody = keyHtml
  .replace(/^[\s\S]*?<body>/, '')
  .replace(/<\/body>[\s\S]*$/, '')
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/g, '')
  .replace(/<script type="module" src="js\/keys\/keyUI\.js"><\/script>\s*/g, '');
// carry the favicon <link> from keys.html into the built head
const keyFavicon = (keyHtml.match(/<link rel="icon"[^>]*>/) || [''])[0];

const inner =
  `<style>\n${css}\n</style>\n` +
  keyBody.trim() + '\n' +
  wasmScript +
  `<script>${keyBundle}</script>\n`;

const full =
  `<!DOCTYPE html>\n<!-- © 2026 Projects and Mods — GPL-3.0-or-later WITH Commons Clause (non-commercial); source + LICENSE: ${SOURCE} -->\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n` +
  `<meta name="viewport" content="width=device-width, initial-scale=1.0">\n` +
  `<title>Funny Looking Rock — photograph a key → print a spare</title>\n` +
  (keyFavicon ? keyFavicon + '\n' : '') +
  `</head>\n<body>\n${inner}</body>\n</html>\n`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const outFile = path.join(root, 'dist', 'funny-looking-rock.html');
fs.writeFileSync(outFile, full);
console.log(`${outFile}: ${(full.length / 1024).toFixed(0)} KB`);

// Body-only fragment (no <html>/<head>/<body>) for publishing as an artifact.
const fragOut = path.join(root, 'dist', 'funny-looking-rock.fragment.html');
fs.writeFileSync(fragOut, inner);
console.log(`${fragOut}: ${(inner.length / 1024).toFixed(0)} KB`);
