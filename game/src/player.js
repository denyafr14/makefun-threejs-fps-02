// player.js — the human's body: mouse look, acceleration movement with friction, crouch,
// jump, and the footsteps that give them away. The tactical heart of the game lives here:
// top speed is set by the weapon in hand, spread in weapons.js is computed from the speed
// you actually have, so the fastest way to shoot straight is to stop.

import { ACTOR, NOISE, WEAPONS } from './config.js';
import { state, publishNoise } from './state.js';
import { input, drainLook } from './input.js';
import { moveCircle } from './collision.js';
import { sfx } from './audio.js';

let stepAcc = 0; // metres walked since the last footstep noise

export function eyeHeight(a) {
  return ACTOR.standEye - a.crouch * (ACTOR.standEye - ACTOR.crouchEye);
}

export function stepPlayer(a, dt) {
  const [dx, dy] = drainLook();
  a.yaw -= dx * 0.0021;
  a.pitch -= dy * 0.0021;
  a.pitch = Math.max(-1.45, Math.min(1.45, a.pitch));

  const canMove = (state.phase === 'live' || state.phase === 'planted') && a.alive && !state.demo;
  const wantCrouch = input.keys.has('ControlLeft') || input.keys.has('KeyC');
  a.crouch += ((wantCrouch ? 1 : 0) - a.crouch) * Math.min(1, dt * 9);

  let fwd = 0, strafe = 0;
  if (canMove) {
    if (input.keys.has('KeyW')) fwd += 1;
    if (input.keys.has('KeyS')) fwd -= 1;
    if (input.keys.has('KeyA')) strafe -= 1;
    if (input.keys.has('KeyD')) strafe += 1;
  }
  const walking = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
  const def = WEAPONS[a.weapons[a.current]];
  let cap = def.moveSpeed;
  if (a.crouch > 0.5) cap = ACTOR.crouchSpeed;
  else if (walking) cap = ACTOR.walkSpeed;

  const sin = Math.sin(a.yaw), cos = Math.cos(a.yaw);
  // wish direction: forward is (-sin yaw, -cos yaw), right is (cos yaw, -sin yaw)... in
  // three.js terms the camera looks down -Z at yaw 0, so forward = (−sin, −cos).
  let wx = (-sin) * fwd + cos * strafe;
  let wz = (-cos) * fwd + (-sin) * strafe;
  const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx /= wl; wz /= wl; }

  if (a.grounded) {
    // friction first, then accelerate toward the wish direction — the source of the
    // game's counter-strafe: release the key and friction stops you almost at once.
    const drop = Math.hypot(a.vel.x, a.vel.z) * ACTOR.friction * dt;
    const sp = Math.hypot(a.vel.x, a.vel.z);
    if (sp > 0) {
      const keep = Math.max(0, sp - drop) / sp;
      a.vel.x *= keep; a.vel.z *= keep;
    }
    a.vel.x += wx * ACTOR.walkAccel * dt;
    a.vel.z += wz * ACTOR.walkAccel * dt;
    const now = Math.hypot(a.vel.x, a.vel.z);
    if (now > cap) { a.vel.x *= cap / now; a.vel.z *= cap / now; }
    if (canMove && input.keys.has('Space')) {
      a.vel.y = ACTOR.jumpSpeed;
      a.grounded = false;
    }
  } else {
    a.vel.x += wx * 10 * dt; // a whisper of air control, never a course change
    a.vel.z += wz * 10 * dt;
    a.vel.y -= ACTOR.gravity * dt;
  }

  const prevY = a.pos.y;
  moveCircle(a.pos, a.vel.x * dt, a.vel.z * dt, ACTOR.radius);
  a.pos.y += a.vel.y * dt;
  if (a.pos.y <= 0) {
    if (!a.grounded && a.vel.y < -5) publishNoise(a.pos.x, a.pos.z, NOISE.land, a.team);
    a.pos.y = 0; a.vel.y = 0; a.grounded = true;
  } else if (prevY === 0 && a.vel.y > 0) {
    a.grounded = false;
  }
  a.speed2d = Math.hypot(a.vel.x, a.vel.z);

  // footsteps: sprinting is loud, walking is nearly silent, crouching is silent
  if (a.grounded && a.speed2d > 0.6) {
    stepAcc += a.speed2d * dt;
    if (stepAcc > 2.3) {
      stepAcc = 0;
      const loud = a.speed2d > ACTOR.walkSpeed + 0.2 && a.crouch < 0.5;
      publishNoise(a.pos.x, a.pos.z, loud ? NOISE.sprint : NOISE.walk, a.team);
      sfx.step();
    }
  }
}
