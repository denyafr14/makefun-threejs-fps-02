// state.js — the one store. Every mutable thing the game has lives in the object below;
// modules read it and write it, and nothing keeps a second copy of a fact anywhere else.
// sim.js steps it, render.js draws from it, hud.js prints it.

import { ECONOMY, ROUND } from './config.js';

export const TEAM = { UNION: 0, WATCH: 1 }; // Union attacks (plants), Watch defends.

export function makeActor(id, team, isPlayer) {
  return {
    id, team, isPlayer: !!isPlayer,
    // kinematics (position is the feet; eye height comes from config via crouch amount)
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, crouch: 0, grounded: true, speed2d: 0,
    // body
    health: 100, armor: 0, alive: true,
    // loadout: weapon instance state lives here, definitions in config.js
    weapons: { primary: null, sidearm: 'ratchet' },
    current: 'sidearm', // 'primary' | 'sidearm'
    mag: 0, reserve: 0, reloadingUntil: 0, nextShotAt: 0, bloom: 0, shotsFired: 0,
    grenades: 0, money: ECONOMY.startMoney,
    // per-round bookkeeping
    kills: 0, deaths: 0,
    // bot brain (unused by the player): see bots.js for the state machine
    brain: null,
    // render handle, set by world.js (a THREE.Group); state never calls into it
    mesh: null, viewmodel: null,
  };
}

export const state = {
  time: 0, // sim seconds since boot; all gameplay timers read this clock
  phase: 'menu', // menu | buy | live | planted | over
  phaseEndsAt: 0,
  round: 0,
  score: [0, 0], // rounds won, by TEAM
  matchOver: false,
  actors: [], // actors[0] is the player; bots follow
  player: null,
  bomb: {
    state: 'carried', // carried | dropped | planting | planted | defusing | exploded | defused
    site: null, // 'A' | 'B': the Union's target, then the planted site
    pos: { x: 0, y: 0, z: 0 },
    plantedAt: 0, endsAt: 0, nextBeepAt: 0,
    progress: 0, // 0..1 of the plant/defuse in hand
    actor: null, // who is planting/defusing right now
    carrier: null, // the actor holding the charge while state is 'carried'
    planter: null, // who planted it (the explosion's attacker)
  },
  noises: [], // {x, z, radius, team, at} — gunfire and footsteps, heard by bots
  feed: [], // killfeed + event lines for hud.js: {text, html, at}
  banner: null, // {title, sub, until} big centre announcements
  lastRoundWinner: null,
  winner: null, // TEAM once the match ends
  wantFire: false, // the player's trigger, copied from input each frame by sim.js
  playerHitmark: null, // {at, kill, head} — hud.js flashes the marker while it is fresh
  playerHurtAt: -9, // last time the player took damage (the vignette reads it)
  demo: null, // set by main.js in ?shot= mode: freezes the sim into a posed scene
};

export function resetMatch() {
  state.score = [0, 0];
  state.round = 0;
  state.matchOver = false;
  state.winner = null;
  for (const a of state.actors) { a.money = ECONOMY.startMoney; a.kills = 0; a.deaths = 0; }
}

export function note(text, html) {
  state.feed.push({ text, html: html ?? text, at: state.time });
  if (state.feed.length > 6) state.feed.shift();
}

export function announce(title, sub, seconds = 2.6) {
  state.banner = { title, sub: sub ?? '', until: state.time + seconds };
}

export function publishNoise(x, z, radius, team) {
  state.noises.push({ x, z, radius, team, at: state.time });
  if (state.noises.length > 48) state.noises.shift();
}

export function roundClockLeft() {
  if (state.phase === 'planted') return Math.max(0, state.bomb.endsAt - state.time);
  return Math.max(0, state.phaseEndsAt - state.time);
}

export { ROUND };
