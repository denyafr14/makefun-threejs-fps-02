// weapons.js — everything a trigger does: the spread model, recoil, reloads, tracers,
// and the Ember grenade. One function, shoot(), serves the player and every bot, so a
// bot's rifle obeys exactly the rules yours does.
//
// Spread (degrees) = the weapon's standing spread, grown toward its moving spread by
// your speed, plus bloom from shots already fired, cut 40% by a crouch, plus a flat
// penalty in the air. Standing still is worth more than any attachment: that is the
// game's whole gunplay lesson, and hud.js draws the crosshair gap from the same number.

import * as THREE from 'three';
import { GRENADE, NOISE, WEAPONS } from './config.js';
import { state, publishNoise } from './state.js';
import { rayHit } from './collision.js';
import { rayVsActor, applyDamage } from './combat.js';
import { view, spawnTracer, spawnSparks, flashMuzzle } from './world.js';
import { BRUSHES } from './map.js';
import { eyeHeight } from './player.js';
import { sfx } from './audio.js';

export function currentDef(a) { return WEAPONS[a.weapons[a.current]]; }

export function resetLoadout(a) {
  a.weapons.primary = null;
  a.current = 'sidearm';
  a.mag = WEAPONS.ratchet.mag;
  a.reserve = WEAPONS.ratchet.reserve;
  a.reloadingUntil = 0;
  a.grenades = 0;
  a.armor = 0;
}

export function giveWeapon(a, key) {
  const def = WEAPONS[key];
  if (def.slot === 1) a.weapons.primary = key;
  a.current = def.slot === 1 ? 'primary' : 'sidearm';
  a.mag = def.mag;
  a.reserve = def.reserve;
  a.reloadingUntil = 0;
}

export function switchTo(a, slot) {
  if (slot === 'primary' && !a.weapons.primary) return;
  if (a.current === slot) return;
  parkAmmo(a);
  a.current = slot;
  const def = currentDef(a);
  a.mag = a['mag_' + slot] ?? def.mag;
  a.reserve = a['reserve_' + slot] ?? def.reserve;
  a.reloadingUntil = 0;
}

// Per-slot ammo is parked on the actor when switching away, so a rifle keeps its mag.
function parkAmmo(a) {
  a['mag_' + a.current] = a.mag;
  a['reserve_' + a.current] = a.reserve;
}

export function startReload(a) {
  const def = currentDef(a);
  if (a.mag >= def.mag || a.reserve <= 0 || state.time < a.reloadingUntil) return false;
  a.reloadingUntil = state.time + def.reloadSec;
  a.reloadEndsAt = a.reloadingUntil;
  publishNoise(a.pos.x, a.pos.z, NOISE.reload, a.team);
  if (a.isPlayer) sfx.reload();
  return true;
}

export function spreadDegrees(a, def) {
  const cap = Math.max(def.moveSpeed, 0.01);
  const moveFrac = Math.min(1, a.speed2d / cap);
  let s = def.spreadStill + (def.spreadMove - def.spreadStill) * Math.pow(moveFrac, 1.6);
  s += a.bloom;
  if (a.crouch > 0.5) s -= def.spreadStill * 0.4;
  if (!a.grounded) s += 3.0;
  return Math.max(0.05, s);
}

function fireDirection(a, spreadDeg, out) {
  const cp = Math.cos(a.pitch), sp = Math.sin(a.pitch);
  out.set(-Math.sin(a.yaw) * cp, sp, -Math.cos(a.yaw) * cp);
  if (spreadDeg > 0) {
    const r = spreadDeg * Math.PI / 180;
    const ox = (Math.random() + Math.random() - 1) * r;
    const oy = (Math.random() + Math.random() - 1) * r;
    // perturb along the camera's right and up vectors
    const rx = Math.cos(a.yaw), rz = -Math.sin(a.yaw);
    out.x += rx * ox; out.z += rz * ox;
    out.y += oy;
    out.normalize();
  }
  return out;
}

const _dir = new THREE.Vector3();
let lastTrigger = false;

// One shot (all pellets). Returns true if a round actually left the barrel.
export function shoot(a) {
  const def = currentDef(a);
  if (!a.alive || state.time < a.nextShotAt || state.time < a.reloadingUntil) return false;
  if (a.mag <= 0) {
    a.nextShotAt = state.time + 0.3;
    if (a.isPlayer) sfx.dryFire();
    startReload(a);
    return false;
  }
  a.mag--;
  a.nextShotAt = state.time + 60 / def.rpm;
  a.lastShotAt = state.time;
  a.bloom = Math.min(6, a.bloom + def.bloom);
  a.recoilVis = 1;
  const spread = spreadDegrees(a, def);
  const eyeY = a.pos.y + eyeHeight(a);
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  const tipX = a.pos.x + fx * 0.55, tipZ = a.pos.z + fz * 0.55, tipY = eyeY - 0.14;
  publishNoise(a.pos.x, a.pos.z, NOISE.shot, a.team);
  sfx.shot(a.weapons[a.current]);
  flashMuzzle(tipX, tipY, tipZ);
  // recoil: the view climbs now and pays most of it back over the next third of a second
  if (a.isPlayer) {
    const kick = def.recoil * Math.PI / 180;
    a.pitch += kick * (0.85 + Math.random() * 0.3);
    a.yaw += (Math.random() - 0.5) * kick * 0.6;
    a.recoilDebt = (a.recoilDebt ?? 0) + kick * 0.55;
  }
  for (let p = 0; p < def.pellets; p++) {
    fireDirection(a, spread, _dir);
    const wall = rayHit(a.pos.x, eyeY, a.pos.z, _dir.x, _dir.y, _dir.z, 140);
    const wallDist = wall ? wall.dist : 140;
    let bestHit = null;
    for (const t of state.actors) {
      if (t.team === a.team || t === a) continue;
      const h = rayVsActor(a.pos.x, eyeY, a.pos.z, _dir.x, _dir.y, _dir.z, t, wallDist);
      if (h && (!bestHit || h.dist < bestHit.dist)) bestHit = { ...h, target: t };
    }
    const endDist = bestHit ? bestHit.dist : wallDist;
    spawnTracer(tipX, tipY, tipZ,
      a.pos.x + _dir.x * endDist, eyeY + _dir.y * endDist, a.pos.z + _dir.z * endDist,
      a.team !== state.player.team);
    if (bestHit) {
      const result = applyDamage(a, bestHit.target, def.damage, bestHit.part, def, bestHit.dist);
      spawnSparks(bestHit.target.pos.x, a.pos.y + eyeHeight(bestHit.target) - 0.2, bestHit.target.pos.z, 4, 0xd94f30);
      if (a.isPlayer) {
        sfx.hit(bestHit.part === 'head');
        state.playerHitmark = { at: state.time, kill: result === 'kill', head: bestHit.part === 'head' };
        if (result === 'kill') sfx.kill();
      }
      if (bestHit.target.isPlayer) sfx.hurt();
    } else if (wall) {
      spawnSparks(wall.x, wall.y, wall.z, 3, 0x9aa3ab);
    }
  }
  return true;
}

// Held-trigger handling for the player: automatics fire while held, the Ratchet and
// the Anvil need a fresh click per shot.
export function stepPlayerTrigger(a) {
  const def = currentDef(a);
  const held = state.wantFire === true;
  if (held && (def.auto || !lastTrigger)) shoot(a);
  lastTrigger = held;
}

const grenades = [];
let grenadeMeshProto = null;

export function throwGrenade(a) {
  if (a.grenades <= 0 || !a.alive || state.time < (a.nextThrowAt ?? 0)) return false;
  a.grenades--;
  a.nextThrowAt = state.time + 0.6;
  if (!grenadeMeshProto) {
    grenadeMeshProto = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xb3502e }),
    );
  }
  const mesh = grenadeMeshProto.clone();
  view.scene.add(mesh);
  const cp = Math.cos(a.pitch + 0.25);
  grenades.push({
    mesh,
    x: a.pos.x, y: a.pos.y + eyeHeight(a), z: a.pos.z,
    vx: -Math.sin(a.yaw) * cp * GRENADE.throwSpeed,
    vy: Math.sin(a.pitch + 0.25) * GRENADE.throwSpeed + 2,
    vz: -Math.cos(a.yaw) * cp * GRENADE.throwSpeed,
    fuse: state.time + GRENADE.fuseSec, owner: a, team: a.team,
  });
  sfx.throwIt();
  return true;
}

const BLAST_DEF = { headMult: 1, legMult: 1, pen: 0.4, range: 0, falloff: 1, killReward: 300 };
export function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.vy -= 12.5 * dt;
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
    if (g.y < 0.09) { g.y = 0.09; g.vy *= -0.38; g.vx *= 0.7; g.vz *= 0.7; }
    g.mesh.position.set(g.x, g.y, g.z);
    if (state.time >= g.fuse) {
      view.scene.remove(g.mesh);
      grenades.splice(i, 1);
      sfx.explode();
      flashMuzzle(g.x, g.y + 0.4, g.z);
      spawnSparks(g.x, g.y + 0.3, g.z, 16, 0xffb347);
      publishNoise(g.x, g.z, 46, g.team);
      for (const t of state.actors) {
        if (!t.alive) continue;
        const dx = t.pos.x - g.x, dz = t.pos.z - g.z;
        const d = Math.hypot(dx, dz);
        if (d > GRENADE.radius) continue;
        // cover shields the blast: any brush between the grenade and the actor eats it
        let blocked = false;
        for (let s = 1; s < 4 && !blocked; s++) {
          const px = g.x + dx * s / 4, pz = g.z + dz * s / 4;
          if (isInsideBrush(px, pz)) blocked = true;
        }
        if (blocked) continue;
        const dmg = GRENADE.damage * (1 - d / (GRENADE.radius + 1.5));
        if (dmg > 4) applyDamage(g.owner, t, dmg, 'torso', BLAST_DEF, 0);
      }
    }
  }
}

function isInsideBrush(x, z) {
  for (const b of BRUSHES) {
    if (Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2 && b.h > 0.9) return true;
  }
  return false;
}

// Per-tick weapon housekeeping for every actor: reloads land, bloom settles, the
// player's borrowed recoil is paid back, viewmodel kick decays.
export function stepWeapons(a, dt) {
  if (a.reloadingUntil && state.time >= a.reloadingUntil) {
    const def = currentDef(a);
    const take = Math.min(def.mag - a.mag, a.reserve);
    a.mag += take;
    a.reserve -= take;
    a.reloadingUntil = 0;
    parkAmmo(a);
  }
  if (state.time - (a.lastShotAt ?? -9) > 0.25) {
    a.bloom = Math.max(0, a.bloom - dt * 9);
  }
  if (a.isPlayer && a.recoilDebt) {
    const repay = Math.min(a.recoilDebt, a.recoilDebt * 7 * dt + 0.0004);
    a.pitch -= repay;
    a.recoilDebt -= repay;
  }
  a.recoilVis = Math.max(0, (a.recoilVis ?? 0) - dt * 7);
}

// --- the first-person viewmodel: one low gun built from boxes per weapon, bobbing
// with your stride and kicking when you fire. Owned here, hung on the camera by
// render.js.
const vmGuns = {};
export function buildViewmodel() {
  const group = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x1d2126 });
  const metal = new THREE.MeshLambertMaterial({ color: 0x39424e });
  const grip = new THREE.MeshLambertMaterial({ color: 0x5f3319 });
  const mk = (key, parts) => {
    const g = new THREE.Group();
    for (const [w, h, d, x, y, z, m] of parts) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m ?? metal);
      mesh.position.set(x, y, z);
      g.add(mesh);
    }
    g.visible = false;
    group.add(g);
    vmGuns[key] = g;
  };
  mk('ratchet', [[0.07, 0.11, 0.3, 0, 0, -0.1, dark], [0.06, 0.14, 0.08, 0, -0.1, 0.02, grip]]);
  mk('cinder', [[0.08, 0.13, 0.52, 0, 0, -0.2, dark], [0.07, 0.2, 0.09, 0, -0.13, -0.18, metal], [0.06, 0.12, 0.07, 0, -0.09, 0.06, grip]]);
  mk('slagborn', [[0.08, 0.12, 0.78, 0, 0.01, -0.32, dark], [0.07, 0.18, 0.09, 0, -0.12, -0.1, metal], [0.05, 0.07, 0.2, 0, 0.1, -0.3, metal], [0.06, 0.12, 0.07, 0, -0.09, 0.12, grip]]);
  mk('anvil', [[0.1, 0.13, 0.62, 0, 0, -0.24, metal], [0.11, 0.09, 0.24, 0, -0.07, -0.3, grip], [0.06, 0.13, 0.08, 0, -0.1, 0.08, grip]]);
  group.position.set(0.24, -0.22, -0.45);
  return group;
}

export function syncViewmodel(group, a, dt) {
  const key = a.weapons[a.current];
  for (const k of Object.keys(vmGuns)) vmGuns[k].visible = k === key && a.alive;
  const bob = a.speed2d > 0.4 && a.grounded ? Math.sin(state.time * 9) * 0.012 : 0;
  const reloading = a.reloadingUntil && state.time < a.reloadingUntil;
  group.position.set(0.24, -0.22 + bob - (reloading ? 0.09 : 0), -0.45 + (a.recoilVis ?? 0) * 0.07);
  group.rotation.x = (a.recoilVis ?? 0) * 0.1 - (reloading ? 0.5 : 0);
}
