// main.js — boot only: build the world, the actors and the HUD, then hand the loop to
// sim.js. It also owns the two ways a session starts: the Play button (pointer lock,
// audio unlock, match start) and ?shot=<scene>, the demo mode the screenshots are
// taken in — a posed, frozen mid-round scene rendered by the game's own code, with
// the sim clock stopped so tracers and the muzzle flash hold for the camera.

import { state, note, TEAM } from './state.js';
import { initRender, renderFrame } from './render.js';
import { initInput } from './input.js';
import { initHud, toggleBuy } from './hud.js';
import { createActors, startMatch } from './rounds.js';
import { buildActorMesh, view } from './world.js';
import { giveWeapon, shoot } from './weapons.js';
import { unlockAudio } from './audio.js';
import { startLoop } from './sim.js';

const params = new URLSearchParams(location.search);
const shot = params.get('shot');

initRender(document.getElementById('game'));
initInput(view.renderer.domElement);
initHud();
const actors = createActors();
for (const a of actors) {
  if (!a.isPlayer) buildActorMesh(a, a.callsign);
}

let started = false;
const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud');

if (shot) {
  document.body.dataset.demo = '1';
  setupDemo(shot);
  overlay.hidden = true;
  hud.hidden = false;
} else {
  document.getElementById('play').addEventListener('click', () => {
    unlockAudio();
    if (!started) {
      started = true;
      startMatch();
    }
    overlay.hidden = true;
    hud.hidden = false;
    view.renderer.domElement.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && started && state.phase !== 'menu') {
      overlay.hidden = false; // Esc brings the menu back; clicking Play resumes the lock
    }
  });
}

startLoop(renderFrame);

// --- demo scenes -------------------------------------------------------------

function pose(a, x, z, yaw, pitch = 0) {
  a.pos.x = x; a.pos.z = z; a.pos.y = 0;
  a.yaw = yaw; a.pitch = pitch;
  a.vel.x = 0; a.vel.z = 0; a.speed2d = 0;
}

function aimAt(a, tx, tz, ty = 1.3) {
  const dx = tx - a.pos.x, dz = tz - a.pos.z;
  a.yaw = Math.atan2(-dx, -dz);
  a.pitch = Math.atan2(ty - 1.62, Math.hypot(dx, dz));
}

function setupDemo(name) {
  startMatch(); // builds round 1 at t=0; everything below re-poses it
  state.time = 40.3; // 40.3 puts the planted charge's blink light in its on phase
  state.demo = { name };
  const p = state.player;
  const bot = (id) => state.actors[id];
  if (name === 'cover') {
    state.phase = 'live';
    state.phaseEndsAt = 40 + 72;
    state.round = 8; state.score = [4, 3];
    giveWeapon(p, 'slagborn');
    pose(p, -13, -4, 0);
    aimAt(p, -4.6, -0.6);
    p.money = 3400; p.grenades = 1;
    const foe = bot(5);
    giveWeapon(foe, 'cinder');
    pose(foe, -4.6, -0.6, 0);
    aimAt(foe, p.pos.x, p.pos.z);
    pose(bot(2), -4.5, -8.5, -Math.PI / 2);
    giveWeapon(bot(2), 'cinder');
    pose(bot(7), 14, 6, Math.PI);
    // staged exchange, hardened so nobody dies of it: the numbers below are the
    // mid-fight state the HUD shows, set after the shots have flown. The foe is
    // overhealed past even a headshot (34 x 4.0 = 136) so the duel stays standing.
    p.health = 100; p.armor = 100; foe.health = 200;
    shoot(foe);
    shoot(p);
    p.health = 78; p.armor = 62; foe.health = 34; p.mag = 14;
    state.playerHitmark = { at: state.time, kill: false, head: true };
    note('', `ASH ▸ VX-11 Cinder ▸ TIDE`);
    note('', `COPPER ▸ AR-7 Slagborn ▸ SEXTANT`);
  } else if (name === 'buy') {
    state.phase = 'buy';
    state.phaseEndsAt = 40 + 9;
    state.round = 3; state.score = [1, 1];
    p.money = 3400;
    pose(p, 2, -29.5, Math.PI);
    pose(bot(1), -3, -26.5, Math.PI - 0.2);
    pose(bot(2), 5.5, -25.5, Math.PI + 0.15);
    pose(bot(3), -7.5, -24, Math.PI);
    pose(bot(4), 0.5, -23, Math.PI - 0.1);
    giveWeapon(bot(1), 'cinder');
    giveWeapon(bot(2), 'slagborn');
    toggleBuy(true);
    state.banner = { title: 'ROUND 3', sub: 'Buy phase', until: 999 };
  } else if (name === 'fight') {
    state.phase = 'live';
    state.phaseEndsAt = 40 + 58;
    state.round = 5; state.score = [2, 2];
    giveWeapon(p, 'anvil');
    pose(p, -39, -1, 0);
    p.health = 56; p.armor = 20; p.money = 1250;
    const foe = bot(7);
    giveWeapon(foe, 'cinder');
    pose(foe, -38.2, -7.5, 0);
    aimAt(foe, p.pos.x, p.pos.z);
    aimAt(p, foe.pos.x, foe.pos.z);
    p.health = 100; p.armor = 100; foe.health = 130; // staged shots cannot kill (see cover)
    shoot(foe);
    shoot(p);
    p.health = 56; p.armor = 20; foe.health = 41; p.mag = 5;
    state.playerHitmark = { at: state.time, kill: false, head: false };
    note('', `COPPER ▸ VX-11 Cinder ▸ SEXTANT`);
  } else if (name === 'plant') {
    state.phase = 'planted';
    state.round = 10; state.score = [5, 4];
    giveWeapon(p, 'slagborn');
    pose(p, -25.5, 26.5, 0);
    aimAt(p, -28.5, 13.5); // over the site, toward the door the Watch rotates through
    p.health = 88; p.armor = 74; p.money = 5150; p.mag = 22;
    state.bomb.state = 'planted';
    state.bomb.site = 'A';
    state.bomb.pos.x = -29.5; state.bomb.pos.z = 20;
    state.bomb.plantedAt = 40;
    state.bomb.endsAt = 40 + 34;
    const mate = bot(1);
    giveWeapon(mate, 'slagborn');
    pose(mate, -31.5, 16.5, 0);
    aimAt(mate, -28, 12.5);
    const foe = bot(8);
    giveWeapon(foe, 'cinder');
    pose(foe, -28, 13.6, 0);
    aimAt(foe, -27, 22);
    note('', 'The charge is planted — the Basin');
    note('', `<span class="me">YOU</span> planted the charge`);
  }
}

export { TEAM };
