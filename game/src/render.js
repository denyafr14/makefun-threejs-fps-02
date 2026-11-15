// render.js — draws state, never touches it. The camera sits at the player's eye
// (lower when crouched, kicked by recoil), the viewmodel hangs off it, world.js syncs
// every actor mesh, and hud.js repaints the overlay. Fixed-step simulation lives in
// sim.js; this file is called once per animation frame after the steps are done.

import { view, initWorld, syncWorld } from './world.js';
import { buildViewmodel, syncViewmodel } from './weapons.js';
import { eyeHeight } from './player.js';
import { syncHud } from './hud.js';
import { state } from './state.js';

let vm = null;

export function initRender(container) {
  initWorld(container);
  view.camera.rotation.order = 'YXZ';
  vm = buildViewmodel();
  view.camera.add(vm);
  view.scene.add(view.camera);
}

export function renderFrame(dt) {
  const p = state.player;
  if (!p) return;
  const cam = view.camera;
  cam.position.set(p.pos.x, p.pos.y + eyeHeight(p), p.pos.z);
  cam.rotation.set(p.pitch + (p.recoilVis ?? 0) * 0.03, p.yaw, 0);
  syncWorld(dt);
  syncViewmodel(vm, p, dt);
  syncHud();
  view.renderer.render(view.scene, cam);
}
