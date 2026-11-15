// SLAGPOINT — entry program for threejs-fps-02 (Node 22, standard library only).
//
// The game itself is the static site in game/: ES modules, no build step, three.js 0.187.0
// vendored under game/vendor/three/ and reached through the import map in game/index.html.
// This program's one job is the hand-in: copy game/ and screenshots/ from beside this file
// into /output, then write /output/dossier.json with buildDossier from the kit's library
// (vendor/makefun-threejs.ts, unchanged) so the judge reads exactly the bytes the scorer
// rebuilds and compares.
//
// Play it locally:  node serve.ts          -> http://localhost:8080
// Hand it in here:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps are the scorer's own (see the kit's gate description): at most 4 screenshots of
// 256 KiB each, at most 993 files and 48 MiB under game/, and 160 KiB of source text in the
// dossier — the one number here that shapes the bytes the judge reads.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(out, 'dossier.json'), dossier);

// A one-line receipt for the entrant running this locally (the grader ignores stdout):
// what was handed in, and the dossier's size against its 1.5 MiB cap.
const shots = readdirSync(join(out, 'screenshots')).filter((f) => !f.startsWith('.'));
console.log(
  `slagpoint: game/ + ${shots.length} screenshot(s) -> ${out}; ` +
  `dossier.json ${statSync(join(out, 'dossier.json')).size} bytes`,
);
