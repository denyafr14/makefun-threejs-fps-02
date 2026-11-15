// combat.js — hit resolution. A shot is a ray; an actor is three boxes: a head that
// pays the headshot multiplier, a torso, and legs that pay less. Damage runs the
// weapon's falloff curve, then armour: a vest stops the non-penetrating share of
// torso and head damage and wears out doing it. Kills are reported to rounds.js
// through a hook so this file never imports the round machine.

import { state } from './state.js';

// Hitbox heights (metres, from the feet). Crouching compresses the whole stack.
function boxesFor(a) {
  const k = 1 - a.crouch * 0.3;
  return {
    head: { cy: 1.56 * k, r: 0.21 },
    torso: { y0: 0.78 * k, y1: 1.44 * k, hx: 0.25, hz: 0.16 },
    legs: { y0: 0, y1: 0.78 * k, hx: 0.24, hz: 0.15 },
  };
}

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxDist) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return -1;
  const t = tca - Math.sqrt(r * r - d2);
  return t > 0 && t < maxDist ? t : -1;
}

function rayBox(ox, oy, oz, dx, dy, dz, cx, cy0, cy1, cz, hx, hz, maxDist) {
  let t0 = 0, t1 = maxDist;
  const slabs = [
    [ox, dx, cx - hx, cx + hx],
    [oy, dy, cy0, cy1],
    [oz, dz, cz - hz, cz + hz],
  ];
  for (const [o, d, mn, mx] of slabs) {
    if (d === 0) { if (o < mn || o > mx) return -1; continue; }
    let ta = (mn - o) / d, tb = (mx - o) / d;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return -1;
  }
  return t0 > 0 ? t0 : -1;
}

// Nearest hit of the ray against one actor: {dist, part: 'head'|'torso'|'legs'} or null.
export function rayVsActor(ox, oy, oz, dx, dy, dz, a, maxDist) {
  if (!a.alive) return null;
  const b = boxesFor(a);
  let best = maxDist, part = null;
  const th = raySphere(ox, oy, oz, dx, dy, dz, a.pos.x, a.pos.y + b.head.cy, a.pos.z, b.head.r, best);
  if (th > 0) { best = th; part = 'head'; }
  const tt = rayBox(ox, oy, oz, dx, dy, dz, a.pos.x, a.pos.y + b.torso.y0, a.pos.y + b.torso.y1, a.pos.z, b.torso.hx, b.torso.hz, best);
  if (tt > 0) { best = tt; part = 'torso'; }
  const tl = rayBox(ox, oy, oz, dx, dy, dz, a.pos.x, a.pos.y + b.legs.y0, a.pos.y + b.legs.y1, a.pos.z, b.legs.hx, b.legs.hz, best);
  if (tl > 0) { best = tl; part = 'legs'; }
  return part ? { dist: best, part } : null;
}

let killHook = null;
export function setKillHook(fn) { killHook = fn; }

// Apply one pellet's damage. Returns 'hit' | 'kill' so the shooter can play its sounds
// and the HUD can flash its marker.
export function applyDamage(attacker, target, baseDamage, part, def, dist) {
  let dmg = baseDamage;
  if (part === 'head') dmg *= def.headMult;
  else if (part === 'legs') dmg *= def.legMult;
  if (dist > def.range) dmg *= Math.max(0.25, def.falloff - (dist - def.range) * 0.008);
  const armored = target.armor > 0 && part !== 'legs';
  if (armored) {
    const stopped = dmg * (1 - def.pen) * 0.5;
    dmg -= stopped;
    target.armor = Math.max(0, target.armor - stopped);
  }
  target.health -= dmg;
  target.lastAttacker = attacker;
  target.lastHitAt = state.time;
  if (target.isPlayer) state.playerHurtAt = state.time;
  if (target.health <= 0 && target.alive) {
    target.health = 0;
    target.alive = false;
    target.deaths++;
    attacker.kills++;
    attacker.money = Math.min(16000, attacker.money + def.killReward);
    if (killHook) killHook(attacker, target, part === 'head');
    return 'kill';
  }
  return 'hit';
}
