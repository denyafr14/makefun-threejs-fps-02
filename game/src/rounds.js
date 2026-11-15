// rounds.js — the match itself: who stands where, what phase it is, when a round is
// won, and what everyone gets paid. Phases run buy -> live -> (planted) -> over, on the
// one clock in state.js. The charge is the second win condition: the Union plants it
// (the player carries it first; a bot takes over if it drops), the Watch defuses it,
// and the round clock, the bomb clock, elimination and defusal are all checked here,
// once, every tick — nowhere else decides a round.

import { ARMOR_PRICE, ECONOMY, GRENADE, ROUND, WEAPONS } from './config.js';
import { state, makeActor, resetMatch, note, announce, TEAM } from './state.js';
import { NAMES, SITES, SPAWNS } from './map.js';
import { makeBrain, planRound, planPostPlant, routeTo } from './bots.js';
import { setKillHook, applyDamage } from './combat.js';
import { resetLoadout, giveWeapon } from './weapons.js';
import { input } from './input.js';
import { sfx } from './audio.js';

export function actorName(a) {
  return a.isPlayer ? 'YOU' : a.callsign;
}

export function createActors() {
  const actors = [];
  const player = makeActor(0, TEAM.UNION, true);
  player.callsign = 'YOU';
  actors.push(player);
  let n = 0;
  for (let i = 1; i <= 4; i++) {
    const a = makeActor(i, TEAM.UNION, false);
    a.callsign = NAMES[0][n++];
    a.brain = makeBrain();
    a.brain.role = i === 3 ? 'lurk' : 'push';
    actors.push(a);
  }
  n = 0;
  for (let i = 5; i <= 9; i++) {
    const a = makeActor(i, TEAM.WATCH, false);
    a.callsign = NAMES[1][n++];
    a.brain = makeBrain();
    actors.push(a);
  }
  for (const a of actors) resetLoadout(a); // everyone starts round 1 with the sidearm loaded
  state.actors = actors;
  state.player = player;
  return actors;
}

function equipBot(a) {
  const hasGun = a.weapons.primary !== null;
  if (!hasGun) {
    if (a.money >= 3550) { buySilent(a, 'slagborn'); a.armor = 100; a.money -= ARMOR_PRICE; }
    else if (a.money >= 2900 && Math.random() > 0.35) buySilent(a, 'slagborn');
    else if (a.money >= 1900) buySilent(a, 'cinder');
    else if (a.money >= 1250 && Math.random() > 0.45) buySilent(a, 'cinder');
    else if (a.money >= 1800 && Math.random() > 0.6) buySilent(a, 'anvil');
  }
  if (a.armor <= 0 && a.money >= ARMOR_PRICE + 300) { a.armor = 100; a.money -= ARMOR_PRICE; }
  if (a.grenades === 0 && a.money >= GRENADE.price + 900) { a.grenades = 1; a.money -= GRENADE.price; }
  if (a.weapons.primary) { // top the mags back up between rounds
    const def = WEAPONS[a.weapons.primary];
    a['mag_primary'] = def.mag; a['reserve_primary'] = def.reserve;
    if (a.current === 'primary') { a.mag = def.mag; a.reserve = def.reserve; }
  }
}

function buySilent(a, key) {
  a.money -= WEAPONS[key].price;
  giveWeapon(a, key);
}

// The player's buy menu (hud.js renders it; keys land here). Buy phase only.
export function buy(a, rowKey) {
  if (state.phase !== 'buy' || !a.alive) return false;
  if (rowKey === 'armor') {
    if (a.armor >= 100 || a.money < ARMOR_PRICE) return false;
    a.money -= ARMOR_PRICE; a.armor = 100;
  } else if (rowKey === 'grenade') {
    if (a.grenades >= 2 || a.money < GRENADE.price) return false;
    a.money -= GRENADE.price; a.grenades++;
  } else {
    const def = WEAPONS[rowKey];
    if (!def) return false;
    if (a.weapons.primary === rowKey || (def.slot === 2 && a.current === 'sidearm')) {
      const d2 = WEAPONS[a.weapons[a.current]];
      a.mag = d2.mag; a.reserve = d2.reserve; // already owned: fresh mags, no charge
    } else {
      if (a.money < def.price) return false;
      a.money -= def.price;
      giveWeapon(a, rowKey);
    }
  }
  sfx.buy();
  return true;
}

export function inSite(x, z) {
  for (const id of ['A', 'B']) {
    const s = SITES[id];
    if (Math.abs(x - s.x) <= s.hx && Math.abs(z - s.z) <= s.hz) return s;
  }
  return null;
}

export function startMatch() {
  resetMatch();
  setKillHook(onKill);
  startBuy();
}

function startBuy() {
  state.round++;
  state.phase = 'buy';
  state.phaseEndsAt = state.time + ROUND.buySec;
  state.bomb.state = 'carried';
  state.bomb.carrier = state.player;
  state.bomb.site = Math.random() > 0.5 ? 'A' : 'B'; // the Union's target this round
  state.bomb.progress = 0;
  state.bomb.actor = null;
  const perTeam = { 0: 0, 1: 0 };
  for (const a of state.actors) {
    const spawn = SPAWNS[a.team][perTeam[a.team]++];
    a.pos.x = spawn.x; a.pos.z = spawn.z; a.pos.y = 0;
    a.vel.x = 0; a.vel.y = 0; a.vel.z = 0;
    a.yaw = a.team === TEAM.UNION ? 0 : Math.PI;
    a.pitch = 0; a.crouch = 0;
    if (!a.alive) resetLoadout(a); // the dead come back with the sidearm and nothing else
    a.alive = true;
    a.health = 100;
    a.reloadingUntil = 0; a.bloom = 0;
    if (a.brain) {
      a.brain.carrier = false;
      a.brain.mode = 'advance';
      a.brain.enemy = null;
      a.brain.thenHold = false;
      a.brain.thenDefuse = false;
      equipBot(a);
    }
  }
  announce(`ROUND ${state.round}`, state.bomb.site === 'A' ? 'Target: the Basin' : 'Target: the Casting Floor', 2.4);
}

function startLive() {
  state.phase = 'live';
  state.phaseEndsAt = state.time + ROUND.liveSec;
  for (const a of state.actors) {
    if (a.brain) planRound(a, state.bomb.site);
  }
  announce('ROUND LIVE', 'Eliminate the Watch — or plant the charge', 1.8);
}

function onKill(killer, victim, headshot) {
  const weaponName = killer.weapons[killer.current] ? WEAPONS[killer.weapons[killer.current]].name : 'Ember';
  const k = `<span class="${killer.isPlayer ? 'me' : ''}">${actorName(killer)}</span>`;
  const v = `<span class="${victim.isPlayer ? 'me' : ''}">${actorName(victim)}</span>`;
  note('', `${k} ▸ ${weaponName} ▸ ${v}${headshot ? ' <span class="head">HEADSHOT</span>' : ''}`);
  if (state.bomb.carrier === victim && state.bomb.state === 'carried') {
    state.bomb.state = 'dropped';
    state.bomb.carrier = null;
    state.bomb.pos.x = victim.pos.x; state.bomb.pos.z = victim.pos.z;
    note('', 'The charge is down');
  }
}

function aliveCount(team) {
  let n = 0;
  for (const a of state.actors) if (a.team === team && a.alive) n++;
  return n;
}

function endRound(winner, reason) {
  state.score[winner]++;
  state.phase = 'over';
  state.phaseEndsAt = state.time + ROUND.endSec;
  state.bomb.state = winner === TEAM.UNION && state.bomb.state === 'planted' ? 'exploded' : state.bomb.state;
  for (const a of state.actors) {
    const pay = a.team === winner ? ECONOMY.winReward : ECONOMY.lossReward;
    a.money = Math.min(ECONOMY.maxMoney, a.money + pay);
  }
  const name = winner === TEAM.UNION ? 'UNION' : 'WATCH';
  announce(`${name} TAKES THE ROUND`, reason, 3.2);
  sfx.roundEnd(winner === TEAM.UNION);
  if (state.score[winner] >= ROUND.roundsToWin || state.round >= ROUND.maxRounds) {
    state.matchOver = true;
    state.winner = state.score[0] === state.score[1] ? winner : (state.score[0] > state.score[1] ? TEAM.UNION : TEAM.WATCH);
  }
}

function plantBomb(actor, site) {
  state.bomb.state = 'planted';
  state.bomb.site = site.id;
  state.bomb.pos.x = site.x; state.bomb.pos.z = site.z;
  state.bomb.plantedAt = state.time;
  state.bomb.endsAt = state.time + ROUND.bombSec;
  state.bomb.planter = actor;
  state.bomb.nextBeepAt = state.time;
  state.phase = 'planted';
  actor.money = Math.min(ECONOMY.maxMoney, actor.money + ECONOMY.plantPlayerReward);
  for (const a of state.actors) {
    if (a.team === TEAM.UNION) a.money = Math.min(ECONOMY.maxMoney, a.money + ECONOMY.plantTeamReward);
    if (a.brain) planPostPlant(a);
  }
  announce('CHARGE PLANTED', site.name, 2.2);
  sfx.plantDone();
}

const BLAST_DEF = { headMult: 1, legMult: 1, pen: 1, range: 999, falloff: 1, killReward: 0 };
function explodeBomb() {
  for (const a of state.actors) {
    if (!a.alive) continue;
    const d = Math.hypot(a.pos.x - state.bomb.pos.x, a.pos.z - state.bomb.pos.z);
    if (d < 8) applyDamage(state.bomb.planter ?? state.player, a, 500, 'torso', BLAST_DEF, 0);
  }
  sfx.explode();
  endRound(TEAM.UNION, 'The charge went up');
}

// Plant/defuse channeling. One place advances or cancels both, for the player's
// held E and for a bot standing at the charge with its brain in the right mode.
function stepChannels(dt) {
  const bomb = state.bomb;
  if (state.phase === 'live' && (bomb.state === 'carried' || bomb.state === 'planting')) {
    const carrier = bomb.carrier;
    let channeling = false;
    if (carrier && carrier.alive) {
      const site = inSite(carrier.pos.x, carrier.pos.z);
      if (site) {
        if (carrier.isPlayer) {
          channeling = input.keys.has('KeyE') && carrier.speed2d < 1.6;
          if (channeling) bomb.site = site.id;
        } else if (carrier.brain && carrier.brain.mode === 'plant') {
          channeling = true;
          bomb.site = site.id;
        }
      }
    }
    if (channeling) {
      bomb.state = 'planting';
      bomb.actor = carrier;
      bomb.progress += dt / ROUND.plantSec;
      if (bomb.progress >= 1) {
        bomb.progress = 0;
        plantBomb(carrier, SITES[bomb.site]);
      }
    } else if (bomb.state === 'planting') {
      bomb.state = 'carried';
      bomb.progress = 0;
      bomb.actor = null;
    }
  }
  if ((state.phase === 'planted') && (bomb.state === 'planted' || bomb.state === 'defusing')) {
    let defuser = null;
    for (const a of state.actors) {
      if (a.team !== TEAM.WATCH || !a.alive || !a.brain) continue;
      if (a.brain.mode === 'defuse' && Math.hypot(a.pos.x - bomb.pos.x, a.pos.z - bomb.pos.z) < 2.4) { defuser = a; break; }
    }
    if (defuser) {
      bomb.state = 'defusing';
      bomb.actor = defuser;
      bomb.progress += dt / ROUND.defuseSec;
      if (bomb.progress >= 1) {
        bomb.progress = 0;
        bomb.state = 'defused';
        endRound(TEAM.WATCH, 'Charge defused');
        return;
      }
    } else if (bomb.state === 'defusing') {
      bomb.state = 'planted';
      bomb.progress = 0;
      bomb.actor = null;
    }
    // the beeps hurry as the timer runs down
    const left = bomb.endsAt - state.time;
    if (state.time >= (bomb.nextBeepAt ?? 0)) {
      sfx.beep(left < 3);
      bomb.nextBeepAt = state.time + (left < 5 ? 0.25 : left < 10 ? 0.5 : left < 20 ? 0.8 : 1.2);
    }
  }
}

// A dropped charge is picked up by the first Union body over it; a bot picker-upper
// becomes the carrier and replans, the player just carries.
function stepBombPickup() {
  const bomb = state.bomb;
  if (bomb.state !== 'dropped') return;
  for (const a of state.actors) {
    if (a.team !== TEAM.UNION || !a.alive) continue;
    if (Math.hypot(a.pos.x - bomb.pos.x, a.pos.z - bomb.pos.z) < 1.4) {
      bomb.state = 'carried';
      bomb.carrier = a;
      if (a.brain) {
        a.brain.carrier = true;
        a.brain.mode = 'advance';
        planRound(a, bomb.site ?? 'A');
      }
      note('', `${actorName(a)} has the charge`);
      return;
    }
  }
  // nobody close: send the first free Union bot for it
  for (const a of state.actors) {
    if (a.team !== TEAM.UNION || !a.alive || !a.brain) continue;
    if (a.brain.mode === 'advance' || a.brain.mode === 'hold') {
      a.brain.mode = 'fetch';
      routeTo(a, bomb.pos.x, bomb.pos.z);
      break;
    }
  }
}

export function stepRounds(dt) {
  if (state.phase === 'buy') {
    if (state.time >= state.phaseEndsAt) startLive();
    return;
  }
  if (state.phase === 'matchover') {
    if (state.time >= state.phaseEndsAt) startMatch(); // a fresh match, same lobby
    return;
  }
  if (state.phase === 'over') {
    if (state.time >= state.phaseEndsAt) {
      if (state.matchOver) {
        announce(state.winner === TEAM.UNION ? 'UNION TAKES SLAGPOINT' : 'THE WATCH HOLDS SLAGPOINT',
          `Final score ${state.score[0]} — ${state.score[1]}`, 5);
        state.phase = 'matchover';
        state.phaseEndsAt = state.time + 6;
      } else {
        startBuy();
      }
    }
    return;
  }
  if (state.phase !== 'live' && state.phase !== 'planted') return;
  stepBombPickup();
  stepChannels(dt);
  if (state.phase === 'over') return; // a defuse may have just ended it

  const unionAlive = aliveCount(TEAM.UNION);
  const watchAlive = aliveCount(TEAM.WATCH);
  if (state.phase === 'live') {
    if (watchAlive === 0) return endRound(TEAM.UNION, 'The Watch is down');
    if (unionAlive === 0) return endRound(TEAM.WATCH, 'The Union is down');
    if (state.time >= state.phaseEndsAt) return endRound(TEAM.WATCH, 'Time — the Watch holds the plant');
  } else { // planted: the round is the bomb's now, elimination of the Union changes nothing
    if (watchAlive === 0) return endRound(TEAM.UNION, 'No one left to defuse');
    if (state.time >= state.bomb.endsAt) return explodeBomb();
  }
}
