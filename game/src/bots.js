// bots.js — the nine soldiers who are not you. Each runs the same state machine:
// ADVANCE along a waypoint route, HOLD a position, ENGAGE what it can see, SEARCH
// toward what it heard or last saw, and — for the charge — PLANT or DEFUSE. Perception
// is honest: a bot only knows about enemies inside its view cone with a clear sight
// line, or noises loud enough to reach it. Aim starts sloppy and settles the longer
// a target stays in view, so a bot that just rounded a corner is beatable and a bot
// holding an angle is not.

import { ACTOR } from './config.js';
import { state, TEAM } from './state.js';
import { ADJACENCY, HOLDS, NODES, nearestNode, SITES } from './map.js';
import { moveCircle, sightBlocked } from './collision.js';
import { shoot, startReload, throwGrenade, currentDef } from './weapons.js';
import { eyeHeight } from './player.js';

export function makeBrain() {
  return {
    mode: 'advance', // advance | hold | engage | search | plant | defuse | fetch
    path: [], pathIdx: 0,
    holdYaw: 0, holdNode: -1, peekUntil: 0, peekDir: 1,
    enemy: null, lastSeenAt: -9, lastSeenX: 0, lastSeenZ: 0, seenSince: 0,
    reactAt: 0, nextThinkAt: Math.random() * 0.2, lastNoiseAt: -1,
    burstLeft: 0, nextBurstAt: 0, strafeDir: 1, strafeUntil: 0, crouchUntil: 0,
    goalX: 0, goalZ: 0, searchUntil: 0, skill: 1.6 + Math.random() * 1.4, // aim error, degrees
    carrier: false, site: 'A', role: 'push',
  };
}

function findPath(fromNode, toNode) {
  if (fromNode === toNode) return [toNode];
  const prev = new Map([[fromNode, -1]]);
  const queue = [fromNode];
  while (queue.length) {
    const n = queue.shift();
    for (const m of ADJACENCY[n]) {
      if (prev.has(m)) continue;
      prev.set(m, n);
      if (m === toNode) {
        const path = [m];
        let cur = m;
        while (prev.get(cur) !== -1) { cur = prev.get(cur); path.unshift(cur); }
        return path;
      }
      queue.push(m);
    }
  }
  return [toNode];
}

export function routeTo(a, x, z) {
  const b = a.brain;
  b.path = findPath(nearestNode(a.pos.x, a.pos.z), nearestNode(x, z));
  b.pathIdx = 0;
  b.goalX = x; b.goalZ = z;
}

// Steer the body: accelerate toward (tx, tz) up to cap, face travel or faceYaw.
// Uses the same friction model as the player, so bots slow into corners the same way.
function steer(a, tx, tz, dt, cap, faceYaw) {
  const dx = tx - a.pos.x, dz = tz - a.pos.z;
  const dist = Math.hypot(dx, dz);
  const want = dist > 0.05 ? Math.min(cap, dist * 2.2) : 0;
  const ux = dist > 0.05 ? dx / dist : 0, uz = dist > 0.05 ? dz / dist : 0;
  const drop = Math.hypot(a.vel.x, a.vel.z) * ACTOR.friction * dt;
  const sp = Math.hypot(a.vel.x, a.vel.z);
  if (sp > 0) { const k = Math.max(0, sp - drop) / sp; a.vel.x *= k; a.vel.z *= k; }
  a.vel.x += ux * ACTOR.walkAccel * dt;
  a.vel.z += uz * ACTOR.walkAccel * dt;
  const now = Math.hypot(a.vel.x, a.vel.z);
  if (now > want && now > 0) { a.vel.x *= want / now; a.vel.z *= want / now; }
  moveCircle(a.pos, a.vel.x * dt, a.vel.z * dt, ACTOR.radius);
  a.speed2d = Math.hypot(a.vel.x, a.vel.z);
  const targetYaw = faceYaw !== undefined ? faceYaw : Math.atan2(-(tx - a.pos.x), -(tz - a.pos.z));
  a.yaw = turnToward(a.yaw, targetYaw, dt * 7);
  return dist;
}

export function turnToward(yaw, target, maxStep) {
  let d = target - yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return yaw + Math.max(-maxStep, Math.min(maxStep, d));
}

function followPath(a, dt, cap) {
  const b = a.brain;
  if (b.pathIdx >= b.path.length) {
    return steer(a, b.goalX, b.goalZ, dt, cap) < 0.5;
  }
  const node = NODES[b.path[b.pathIdx]];
  const d = steer(a, node.x, node.z, dt, cap);
  if (d < 0.8) { b.pathIdx++; b.stuckAt = state.time; b.stuckX = a.pos.x; b.stuckZ = a.pos.z; return false; }
  // stuck insurance: if the body has barely moved in 2.5 s (a brush edge the graph
  // did not know about), give up on this node and take the next one
  if (state.time - (b.stuckAt ?? 0) > 2.5) {
    const moved = Math.hypot(a.pos.x - (b.stuckX ?? a.pos.x), a.pos.z - (b.stuckZ ?? a.pos.z));
    if (moved < 0.4) b.pathIdx++;
    b.stuckAt = state.time; b.stuckX = a.pos.x; b.stuckZ = a.pos.z;
  }
  return false;
}

function canSee(a, e) {
  const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 62) return false;
  if (dist > 5) {
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    if ((dx * fx + dz * fz) / dist < 0.34) return false; // ~100° cone
  }
  return !sightBlocked(a.pos.x, a.pos.z, e.pos.x, e.pos.z);
}

function perceive(a) {
  const b = a.brain;
  let best = null, bestD = Infinity;
  for (const e of state.actors) {
    if (e.team === a.team || !e.alive) continue;
    if (!canSee(a, e)) continue;
    const d = Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z);
    if (d < bestD) { bestD = d; best = e; }
  }
  if (best) {
    if (b.enemy !== best) { b.seenSince = state.time; b.reactAt = state.time + 0.16 + Math.random() * 0.18; }
    b.enemy = best;
    b.lastSeenAt = state.time;
    b.lastSeenX = best.pos.x; b.lastSeenZ = best.pos.z;
    if (b.mode !== 'plant' && b.mode !== 'defuse') b.mode = 'engage';
    return;
  }
  // hearing: the loudest recent noise from the other team pulls a SEARCH
  for (let i = state.noises.length - 1; i >= 0; i--) {
    const n = state.noises[i];
    if (n.at <= b.lastNoiseAt || n.team === a.team) continue;
    b.lastNoiseAt = n.at;
    const d = Math.hypot(n.x - a.pos.x, n.z - a.pos.z);
    if (d < n.radius && b.mode !== 'engage' && b.mode !== 'plant' && b.mode !== 'defuse') {
      b.mode = 'search';
      b.goalX = n.x; b.goalZ = n.z;
      routeTo(a, n.x, n.z);
      b.searchUntil = state.time + 5;
    }
    break;
  }
}

function engage(a, dt) {
  const b = a.brain;
  const e = b.enemy;
  const visible = e && e.alive && state.time - b.lastSeenAt < 0.25;
  if (!e || !e.alive || state.time - b.lastSeenAt > 1.4) {
    b.mode = 'search';
    b.goalX = b.lastSeenX; b.goalZ = b.lastSeenZ;
    routeTo(a, b.goalX, b.goalZ);
    b.searchUntil = state.time + 4;
    return;
  }
  const tx = visible ? e.pos.x : b.lastSeenX;
  const tz = visible ? e.pos.z : b.lastSeenZ;
  const dist = Math.hypot(tx - a.pos.x, tz - a.pos.z);
  // face the target and aim: error starts at the bot's skill and settles with sight time
  const aimYaw = Math.atan2(-(tx - a.pos.x), -(tz - a.pos.z));
  a.yaw = turnToward(a.yaw, aimYaw, dt * 10);
  const settle = Math.max(0.22, 1 - (state.time - b.seenSince) / 0.9);
  const err = b.skill * settle * Math.PI / 180;
  const targetHeight = (e.crouch > 0.5 ? 1.0 : 1.32) + (Math.random() - 0.5) * 0.14;
  const dy = (e.pos.y + targetHeight) - (a.pos.y + eyeHeight(a));
  a.pitch = Math.atan2(dy, Math.max(dist, 0.1)) + (Math.random() - 0.5) * err;
  a.yaw += (Math.random() - 0.5) * err;
  // movement: strafe in bursts of direction, close or back off to the weapon's band
  if (state.time > b.strafeUntil) { b.strafeDir = Math.random() > 0.5 ? 1 : -1; b.strafeUntil = state.time + 0.6 + Math.random() * 0.9; }
  const def = currentDef(a);
  let mx = a.pos.x, mz = a.pos.z;
  const px = Math.cos(a.yaw) * b.strafeDir, pz = -Math.sin(a.yaw) * b.strafeDir;
  mx += px * 2.2; mz += pz * 2.2;
  if (dist > def.range * 0.8) { mx += (tx - a.pos.x) * 0.4; mz += (tz - a.pos.z) * 0.4; }
  if (dist < 6) { mx -= (tx - a.pos.x) * 0.4; mz -= (tz - a.pos.z) * 0.4; }
  steer(a, mx, mz, dt, def.moveSpeed * 0.92, a.yaw);
  a.crouch = state.time < b.crouchUntil ? 1 : 0;
  // fire control: bursts with pauses, only after the reaction delay, only when settled enough
  if (!visible || state.time < b.reactAt) return;
  if (a.mag === 0) { startReload(a); return; }
  if (b.burstLeft <= 0) {
    if (state.time < b.nextBurstAt) return;
    b.burstLeft = def.rpm > 500 ? 3 + (Math.random() * 3 | 0) : 1;
    if (dist > 18 && Math.random() > 0.5) b.crouchUntil = state.time + 0.8;
    if (a.grenades > 0 && dist > 8 && dist < 21 && Math.random() > 0.72) throwGrenade(a);
  }
  if (shoot(a)) {
    b.burstLeft--;
    if (b.burstLeft <= 0) b.nextBurstAt = state.time + 0.32 + Math.random() * 0.4;
  }
}

export function stepBot(a, dt) {
  const b = a.brain;
  if (!b || !a.alive) return;
  if (state.time >= b.nextThinkAt) {
    b.nextThinkAt = state.time + 0.11;
    perceive(a);
  }
  const def = currentDef(a);
  switch (b.mode) {
    case 'engage':
      engage(a, dt);
      break;
    case 'plant':
    case 'defuse':
      // standing at the charge, working: rounds.js runs the timer; an enemy in the
      // perception pass above flips the mode to engage and breaks the channel
      steer(a, a.pos.x, a.pos.z, dt, 0);
      a.crouch = 1;
      break;
    case 'hold': {
      const node = NODES[b.holdNode];
      const d = steer(a, node.x, node.z, dt, def.moveSpeed, b.holdYaw);
      if (d < 0.6) {
        // settled: face the angle, peek a half-step each way every few seconds
        if (state.time > b.peekUntil) { b.peekDir *= -1; b.peekUntil = state.time + 2 + Math.random() * 2.4; }
        const px = Math.cos(b.holdYaw) * b.peekDir * 0.55;
        const pz = -Math.sin(b.holdYaw) * b.peekDir * 0.55;
        steer(a, node.x + px, node.z + pz, dt, 1.4, b.holdYaw);
      }
      break;
    }
    case 'search': {
      const arrived = followPath(a, dt, def.moveSpeed * 0.94);
      if (arrived || state.time > b.searchUntil) {
        // sweep, then fall back to the round plan
        a.yaw += dt * 1.7;
        if (state.time > b.searchUntil + 1.2) resumePlan(a);
      }
      break;
    }
    case 'fetch': {
      const arrived = followPath(a, dt, def.moveSpeed);
      if (arrived) resumePlan(a);
      break;
    }
    default: { // advance
      const arrived = followPath(a, dt, def.moveSpeed);
      if (arrived) arriveAtPlan(a);
    }
  }
  // a bot with a dry mag and no fight reloads behind its current cover
  if (a.mag === 0 && b.mode !== 'engage') startReload(a);
  if (a.reloadingUntil && state.time < a.reloadingUntil) { /* reload runs in stepWeapons */ }
}

function resumePlan(a) {
  const b = a.brain;
  if (a.team === TEAM.WATCH && state.bomb.state !== 'planted' && state.bomb.state !== 'defusing') {
    const hold = HOLDS[a.id % HOLDS.length];
    b.mode = 'advance';
    b.holdNode = hold.node; b.holdYaw = hold.yaw;
    routeTo(a, NODES[hold.node].x, NODES[hold.node].z);
    b.thenHold = true;
    return;
  }
  const site = SITES[b.site];
  b.mode = 'advance';
  routeTo(a, site.x, site.z);
}

function arriveAtPlan(a) {
  const b = a.brain;
  if (b.thenDefuse) {
    b.thenDefuse = false;
    b.mode = 'defuse';
    return;
  }
  if (b.thenHold) {
    b.thenHold = false;
    b.mode = 'hold';
    return;
  }
  if (a.team === TEAM.UNION) {
    if (b.carrier && state.bomb.state === 'carried') { b.mode = 'plant'; return; }
    // escorts settle into a loose hold around the site they pushed
    b.mode = 'hold';
    b.holdNode = nearestNode(a.pos.x, a.pos.z);
    b.holdYaw = Math.PI; // watch the doors the Watch rotate through (north)
    if (a.pos.z < 10) b.holdYaw = 0;
    return;
  }
  b.mode = 'hold';
  b.holdNode = nearestNode(a.pos.x, a.pos.z);
  if (!b.holdYaw) b.holdYaw = Math.PI;
}

// Round-start planning, called by rounds.js once positions are set.
export function planRound(a, siteId) {
  const b = a.brain;
  b.site = siteId;
  b.enemy = null;
  b.mode = 'advance';
  if (a.team === TEAM.WATCH) {
    const hold = HOLDS[a.id % HOLDS.length];
    b.holdNode = hold.node; b.holdYaw = hold.yaw;
    b.thenHold = true;
    routeTo(a, NODES[hold.node].x, NODES[hold.node].z);
  } else if (b.carrier) {
    const site = SITES[siteId];
    routeTo(a, site.x, site.z);
  } else {
    // escorts split: most go with the charge, one lurks the far lane as a cut-off
    const site = SITES[siteId];
    if (b.role === 'lurk') routeTo(a, siteId === 'A' ? 39 : -39, 8);
    else routeTo(a, site.x + (Math.random() * 8 - 4), site.z - 6);
  }
}

// Once the charge is down, everyone converges: defenders to defuse or clear,
// attackers to hold the ground around it. Called by rounds.js at plant time.
export function planPostPlant(a) {
  const b = a.brain;
  const site = SITES[state.bomb.site];
  b.site = state.bomb.site;
  if (a.team === TEAM.WATCH) {
    b.mode = 'advance';
    b.thenDefuse = true;
    routeTo(a, state.bomb.pos.x, state.bomb.pos.z);
  } else {
    b.mode = 'hold';
    b.holdNode = nearestNode(a.pos.x, a.pos.z);
    b.holdYaw = Math.atan2(-(site.x - a.pos.x), -(site.z - a.pos.z));
    routeTo(a, a.pos.x, a.pos.z);
  }
}
