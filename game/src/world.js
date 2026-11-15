// world.js — turns map.js's data into the three.js scene: brushes become boxes in the
// smelter palette, the yard floor is one canvas texture with the sites painted on it,
// and every actor gets a low, readable soldier built from boxes. It also owns the
// transient visuals (tracers, impact sparks, muzzle light, the planted charge) as
// fixed pools, so the render loop allocates nothing. It never changes game state;
// render.js calls syncWorld() after each sim step.

import * as THREE from 'three';
import { PALETTE } from './config.js';
import { BRUSHES, SITES } from './map.js';
import { state, TEAM } from './state.js';

export const view = { scene: null, camera: null, renderer: null };
const MAT = {};
let bombMesh = null, bombLight = null, muzzleLight = null;
const tracers = [];
const sparks = [];

function makeGroundTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 768;
  const g = c.getContext('2d');
  const px = (x) => (x + 47) / 94 * 1024, pz = (z) => (z + 37) / 74 * 768;
  g.fillStyle = '#3a3f45'; g.fillRect(0, 0, 1024, 768);
  for (let i = 0; i < 5200; i++) { // worn concrete speckle
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
    g.fillRect(Math.random() * 1024, Math.random() * 768, 2.5, 2.5);
  }
  g.strokeStyle = 'rgba(237,230,218,0.10)'; g.lineWidth = 2; // expansion joints
  for (let x = -40; x <= 40; x += 10) { g.beginPath(); g.moveTo(px(x), 0); g.lineTo(px(x), 768); g.stroke(); }
  for (let z = -30; z <= 30; z += 10) { g.beginPath(); g.moveTo(0, pz(z)); g.lineTo(1024, pz(z)); g.stroke(); }
  for (const site of [SITES.A, SITES.B]) { // hazard border + the site letter, painted big
    g.strokeStyle = '#ffb347'; g.lineWidth = 5; g.setLineDash([18, 10]);
    g.strokeRect(px(site.x - site.hx), pz(site.z - site.hz), site.hx * 2 / 94 * 1024, site.hz * 2 / 74 * 768);
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,179,71,0.20)';
    g.font = '700 92px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(site.id, px(site.x), pz(site.z));
  }
  g.fillStyle = 'rgba(237,230,218,0.13)'; // lane names on the asphalt
  g.font = '600 25px system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText('C U L V E R T', px(-39), pz(-13));
  g.fillText('C O N V E Y O R', px(39), pz(-13));
  g.fillText('F U R N A C E   H A L L', px(0), pz(21));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export function initWorld(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.canvas);
  scene.fog = new THREE.Fog(PALETTE.canvas, 55, 130);
  const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.08, 220);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  container.appendChild(renderer.domElement);
  view.scene = scene; view.camera = camera; view.renderer = renderer;

  MAT.wall = new THREE.MeshLambertMaterial({ color: PALETTE.gunmetal });
  MAT.wallCap = new THREE.MeshLambertMaterial({ color: 0x3d454f });
  MAT.furnace = new THREE.MeshLambertMaterial({ color: PALETTE.rustDark });
  MAT.furnaceGlow = new THREE.MeshBasicMaterial({ color: PALETTE.sodium });
  MAT.rust = new THREE.MeshLambertMaterial({ color: PALETTE.rust });
  MAT.teal = new THREE.MeshLambertMaterial({ color: PALETTE.teal });
  MAT.concrete = new THREE.MeshLambertMaterial({ color: PALETTE.concrete });
  MAT.block = new THREE.MeshLambertMaterial({ color: 0x484e54 });
  MAT.machine = new THREE.MeshLambertMaterial({ color: 0x232830 });
  MAT.machineGlow = new THREE.MeshBasicMaterial({ color: PALETTE.teal });
  MAT.dark = new THREE.MeshLambertMaterial({ color: 0x191d22 });

  // dusk light: low warm sun from the west, teal sky fill, sodium points over the
  // sites, the hall, both lanes and both yards — nowhere a fight happens is unlit
  scene.add(new THREE.HemisphereLight(0x51707a, 0x1c1712, 1.05));
  const sun = new THREE.DirectionalLight(0xffc98a, 1.25);
  sun.position.set(-60, 34, -18);
  scene.add(sun);
  for (const [x, z] of [[0, 0], [-30, 20], [30, 20], [-39, -4], [39, -4], [0, -30], [0, 30]]) {
    const p = new THREE.PointLight(PALETTE.sodium, 560, 42, 2);
    p.position.set(x, 6.4, z);
    scene.add(p);
  }
  muzzleLight = new THREE.PointLight(PALETTE.sodium, 0, 13, 2);
  scene.add(muzzleLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(94, 74),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  for (const b of BRUSHES) {
    const mat = b.kind === 'wall' ? MAT.wall
      : b.kind === 'furnace' ? MAT.furnace
      : b.kind === 'container' ? (b.tone === 'teal' ? MAT.teal : MAT.rust)
      : b.kind === 'cover' ? MAT.concrete
      : b.kind === 'machine' ? MAT.machine : MAT.block;
    scene.add(box(b.w, b.h, b.d, mat, b.x, b.h / 2, b.z));
    if (b.kind === 'wall' && b.h > 3) scene.add(box(b.w + 0.15, 0.22, b.d + 0.15, MAT.wallCap, b.x, b.h + 0.1, b.z));
    if (b.kind === 'machine') scene.add(box(1.4, 0.5, 0.1, MAT.machineGlow, b.x, 1.35, b.z + b.d / 2 + 0.03));
  }
  // the furnace's lit throat and the stack band — the landmark you navigate by
  scene.add(box(3.4, 1.5, 0.2, MAT.furnaceGlow, 0, 1.15, -3.6));
  scene.add(box(7.3, 0.5, 7.3, MAT.rust, 0, 7.6, 0));

  // lamp poles around the yard (emissive heads; the three real lights are above)
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6.4, 6);
  for (const [x, z] of [[-16, -14], [16, -14], [-16, 14], [16, 14], [-41, 30], [41, 30], [0, -30]]) {
    const pole = new THREE.Mesh(poleGeo, MAT.dark);
    pole.position.set(x, 3.2, z);
    scene.add(pole);
    scene.add(box(0.7, 0.18, 0.7, MAT.furnaceGlow, x, 6.45, z));
  }
  // the casting crane: a beam and hook high over Site B, supports outside the play space
  scene.add(box(26, 0.7, 1.1, MAT.rust, 30, 8.2, 20));
  scene.add(box(0.18, 2.6, 0.18, MAT.dark, 33, 6.6, 20));
  scene.add(box(1.1, 0.9, 1.1, MAT.machine, 33, 5.1, 20));
  // dock silhouettes beyond the walls, so the horizon is not empty
  for (const [x, z, w, h] of [[-70, 10, 26, 15], [66, -16, 30, 11], [10, 62, 44, 18], [-30, -58, 36, 9]]) {
    scene.add(box(w, h, 8, MAT.dark, x, h / 2, z));
  }

  // the charge: a slab with a keypad light, blinked in syncWorld once planted
  bombMesh = new THREE.Group();
  const slab = box(0.52, 0.18, 0.38, MAT.machine, 0, 0.09, 0);
  bombLight = box(0.12, 0.05, 0.12, MAT.furnaceGlow, 0.14, 0.2, 0);
  bombMesh.add(slab, bombLight);
  bombMesh.visible = false;
  scene.add(bombMesh);

  // tracer pool: thin stretched boxes read better than 1px lines at dusk
  const tracerGeo = new THREE.BoxGeometry(0.05, 0.05, 1);
  for (let i = 0; i < 28; i++) {
    const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: PALETTE.sodium, transparent: true }));
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, until: 0 });
  }
  const sparkGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true }));
    m.visible = false;
    scene.add(m);
    sparks.push({ mesh: m, vel: new THREE.Vector3(), until: 0 });
  }
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

const _mid = new THREE.Vector3(), _dir = new THREE.Vector3();
export function spawnTracer(x1, y1, z1, x2, y2, z2, enemy) {
  const t = tracers.find((s) => !s.mesh.visible) ?? tracers[0];
  _mid.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  _dir.set(x2 - x1, y2 - y1, z2 - z1);
  const len = _dir.length();
  t.mesh.position.copy(_mid);
  t.mesh.scale.set(1, 1, Math.max(len, 0.1));
  t.mesh.lookAt(x2, y2, z2);
  t.mesh.material.color.setHex(enemy ? 0xff7a4d : PALETTE.sodium);
  t.mesh.material.opacity = 0.85;
  t.mesh.visible = true;
  t.until = state.time + 0.055;
}

export function spawnSparks(x, y, z, n, color) {
  let made = 0;
  for (const s of sparks) {
    if (s.mesh.visible) continue;
    s.mesh.position.set(x, y, z);
    s.mesh.material.color.setHex(color ?? 0xffd9a0);
    s.vel.set((Math.random() - 0.5) * 2.6, Math.random() * 2.4, (Math.random() - 0.5) * 2.6);
    s.mesh.visible = true;
    s.until = state.time + 0.28;
    if (++made >= n) break;
  }
}

export function flashMuzzle(x, y, z) {
  muzzleLight.position.set(x, y, z);
  muzzleLight.intensity = 260;
}

// One soldier per actor, from boxes: legs, team-coloured torso, helmet, gun. The name
// rides on a small canvas sprite so teammates and targets read at a glance.
export function buildActorMesh(actor, callsign) {
  const group = new THREE.Group();
  const teamMat = new THREE.MeshLambertMaterial({ color: actor.team === TEAM.UNION ? PALETTE.union : PALETTE.watch });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x22262c });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xc9a186 });
  const legL = box(0.17, 0.78, 0.2, darkMat, -0.11, 0.39, 0);
  const legR = box(0.17, 0.78, 0.2, darkMat, 0.11, 0.39, 0);
  const torso = box(0.46, 0.62, 0.26, teamMat, 0, 1.1, 0);
  const head = box(0.24, 0.26, 0.24, skinMat, 0, 1.56, 0);
  const helmet = box(0.3, 0.12, 0.3, darkMat, 0, 1.72, 0);
  const gun = box(0.07, 0.16, 0.78, darkMat, 0.16, 1.24, -0.3);
  group.add(legL, legR, torso, head, helmet, gun);
  let sprite = null;
  if (callsign) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 56;
    const g = c.getContext('2d');
    g.font = '600 30px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillStyle = actor.team === TEAM.UNION ? '#ffb347' : '#9adbe8';
    g.fillText(callsign, 128, 38);
    const tex = new THREE.CanvasTexture(c);
    sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(1.5, 0.33, 1);
    sprite.position.y = 2.05;
    group.add(sprite);
  }
  view.scene.add(group);
  actor.mesh = { group, legL, legR, torso, head, gun, sprite };
  return group;
}

// Per-frame visual sync: meshes follow state, the dead fall, the charge blinks,
// tracers and sparks burn out. dt is render dt — visuals only, never gameplay.
export function syncWorld(dt) {
  for (const a of state.actors) {
    if (!a.mesh || a.isPlayer) continue;
    const m = a.mesh;
    m.group.position.set(a.pos.x, a.pos.y, a.pos.z);
    m.group.rotation.set(0, a.yaw, 0);
    if (!a.alive) {
      m.group.rotation.x = -Math.PI / 2;
      m.group.position.y = a.pos.y + 0.22;
      if (m.sprite) m.sprite.visible = false;
      continue;
    }
    if (m.sprite) m.sprite.visible = true;
    const crouchDip = a.crouch * 0.34;
    m.torso.position.y = 1.1 - crouchDip;
    m.head.position.y = 1.56 - crouchDip;
    m.gun.position.y = 1.24 - crouchDip;
    const stride = a.speed2d > 0.4 ? Math.sin(state.time * 10 + a.id * 2.1) * 0.16 : 0;
    m.legL.position.z = stride; m.legR.position.z = -stride;
    m.gun.position.z = -0.3 - (a.recoilVis ?? 0) * 0.1;
  }
  if (state.bomb.state === 'planted' || state.bomb.state === 'defusing') {
    bombMesh.visible = true;
    bombMesh.position.set(state.bomb.pos.x, 0, state.bomb.pos.z);
    const left = state.bomb.endsAt - state.time;
    const rate = left < 10 ? 9 : left < 20 ? 4.5 : 2.2; // the beeps hurry as it runs down
    bombLight.material = Math.sin(state.time * rate * Math.PI) > 0 ? MAT.furnaceGlow : MAT.machine;
  } else if (state.bomb.state === 'planting') {
    bombMesh.visible = true;
    bombMesh.position.set(state.bomb.pos.x, 0, state.bomb.pos.z);
  } else {
    bombMesh.visible = false;
  }
  for (const t of tracers) {
    if (t.mesh.visible && state.time > t.until) t.mesh.visible = false;
  }
  for (const s of sparks) {
    if (!s.mesh.visible) continue;
    if (state.time > s.until) { s.mesh.visible = false; continue; }
    s.vel.y -= 7 * dt;
    s.mesh.position.addScaledVector(s.vel, dt);
  }
  if (muzzleLight.intensity > 0) muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 5200);
}
