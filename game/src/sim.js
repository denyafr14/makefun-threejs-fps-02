// sim.js — the fixed-step loop. Rendering runs whenever the browser paints, but the
// game itself advances in exact 1/60 s steps from an accumulator, so a 30 Hz laptop
// and a 144 Hz monitor play the same match. Each step runs the systems in one fixed
// order — rounds, player, bots, weapons, grenades — and no system reaches into
// another's turn. In ?shot= demo mode the clock is frozen and nothing steps at all:
// main.js has already posed the scene the screenshot needs.

import { state } from './state.js';
import { input, consumePresses } from './input.js';
import { stepRounds } from './rounds.js';
import { stepPlayer } from './player.js';
import { stepBot } from './bots.js';
import { stepWeapons, stepGrenades, stepPlayerTrigger, startReload, switchTo, throwGrenade } from './weapons.js';
import { handleBuyKey } from './hud.js';

export const STEP = 1 / 60;
let acc = 0;
let lastTs = 0;

function handlePresses() {
  const p = state.player;
  for (const code of consumePresses()) {
    if (state.phase === 'buy') { handleBuyKey(code); continue; }
    if (!p || !p.alive) continue;
    if (code === 'KeyR') startReload(p);
    else if (code === 'KeyG') throwGrenade(p);
    else if (code === 'Digit1') switchTo(p, 'primary');
    else if (code === 'Digit2') switchTo(p, 'sidearm');
    else if (code === 'KeyB') handleBuyKey(code);
  }
}

export function stepGame(dt) {
  state.time += dt;
  if (state.demo) return;
  stepRounds(dt);
  const p = state.player;
  if (!p) return;
  if (p.alive) stepPlayer(p, dt);
  if (state.phase === 'live' || state.phase === 'planted') {
    for (const a of state.actors) if (a.brain && a.alive) stepBot(a, dt);
    if (p.alive) stepPlayerTrigger(p);
    stepGrenades(dt);
  }
  for (const a of state.actors) stepWeapons(a, dt);
}

export function startLoop(renderFrame) {
  const frame = (ts) => {
    requestAnimationFrame(frame);
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.25) dt = 0.25; // a backgrounded tab does not get to fast-forward the match
    handlePresses();
    state.wantFire = input.firing;
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      stepGame(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === 5) acc = 0;
    renderFrame(dt);
  };
  requestAnimationFrame(frame);
}
