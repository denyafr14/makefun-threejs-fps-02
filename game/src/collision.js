// collision.js — pure geometry against map.js's brush list. No state of its own: actors
// are circles on the ground plane, bullets are rays through 3D boxes, sight is a 2D
// segment test. Everything the game asks about the shape of the world is answered here.

import { BRUSHES } from './map.js';

// Move a circle (pos.x/pos.z, radius r) by (dx, dz), sliding along brush faces.
// Two relaxation passes settle corners; brushes block at every height because the map
// has no vaulting — 1.1 m cover is cover, not a step.
export function moveCircle(pos, dx, dz, r) {
  pos.x += dx;
  pos.z += dz;
  for (let pass = 0; pass < 2; pass++) {
    for (const b of BRUSHES) {
      const minX = b.x - b.w / 2 - r, maxX = b.x + b.w / 2 + r;
      const minZ = b.z - b.d / 2 - r, maxZ = b.z + b.d / 2 + r;
      if (pos.x <= minX || pos.x >= maxX || pos.z <= minZ || pos.z >= maxZ) continue;
      const pushL = pos.x - minX, pushR = maxX - pos.x;
      const pushD = pos.z - minZ, pushU = maxZ - pos.z;
      const m = Math.min(pushL, pushR, pushD, pushU);
      if (m === pushL) pos.x = minX;
      else if (m === pushR) pos.x = maxX;
      else if (m === pushD) pos.z = minZ;
      else pos.z = maxZ;
    }
  }
  return pos;
}

// Ray vs every brush (3D slab test; a brush stands on y=0 and rises to its h) plus the
// ground plane. Returns the nearest hit {dist, x, y, z, brush} or null past maxDist.
const _hit = { dist: 0, x: 0, y: 0, z: 0, brush: null };
export function rayHit(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist, bestBrush = null;
  for (const b of BRUSHES) {
    const minX = b.x - b.w / 2, maxX = b.x + b.w / 2;
    const minZ = b.z - b.d / 2, maxZ = b.z + b.d / 2;
    let t0 = 0, t1 = best;
    // X slab
    if (dx === 0) { if (ox < minX || ox > maxX) continue; }
    else {
      let ta = (minX - ox) / dx, tb = (maxX - ox) / dx;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    // Y slab (brushes span 0..h)
    if (dy === 0) { if (oy < 0 || oy > b.h) continue; }
    else {
      let ta = (0 - oy) / dy, tb = (b.h - oy) / dy;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    // Z slab
    if (dz === 0) { if (oz < minZ || oz > maxZ) continue; }
    else {
      let ta = (minZ - oz) / dz, tb = (maxZ - oz) / dz;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (t0 < best) { best = t0; bestBrush = b; }
  }
  if (dy < 0) { // the yard floor
    const t = -oy / dy;
    if (t > 0 && t < best) { best = t; bestBrush = null; }
  }
  if (best >= maxDist) return null;
  _hit.dist = best;
  _hit.x = ox + dx * best; _hit.y = oy + dy * best; _hit.z = oz + dz * best;
  _hit.brush = bestBrush;
  return _hit;
}

// Can eyes at standing height see from (x1, z1) to (x2, z2)? A brush blocks the segment
// only if it is tall enough to hide a standing actor (1.35 m): the 1.1 m weirs and ingot
// stacks are peeked over, which is the whole point of them.
export function sightBlocked(x1, z1, x2, z2) {
  for (const b of BRUSHES) {
    if (b.h < 1.35) continue;
    if (segmentHitsBox(x1, z1, x2, z2, b)) return true;
  }
  return false;
}

// Grenade blast check: same test at any height — a 1.1 m weir does shield a crouched
// actor from a grenade on the other side, so here every brush counts.
export function blastBlocked(x1, z1, x2, z2) {
  for (const b of BRUSHES) {
    if (segmentHitsBox(x1, z1, x2, z2, b)) return true;
  }
  return false;
}

function segmentHitsBox(x1, z1, x2, z2, b) {
  const minX = b.x - b.w / 2, maxX = b.x + b.w / 2;
  const minZ = b.z - b.d / 2, maxZ = b.z + b.d / 2;
  const dx = x2 - x1, dz = z2 - z1;
  let t0 = 0, t1 = 1;
  if (dx === 0) { if (x1 < minX || x1 > maxX) return false; }
  else {
    let ta = (minX - x1) / dx, tb = (maxX - x1) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (dz === 0) { if (z1 < minZ || z1 > maxZ) return false; }
  else {
    let ta = (minZ - z1) / dz, tb = (maxZ - z1) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}
