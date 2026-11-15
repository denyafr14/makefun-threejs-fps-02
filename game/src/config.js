// config.js — every tuned number in one place: palette, weapons, economy, round timings.
// Nothing in here mutates; the modules that play the game read it.

// The smelter at dusk. world.js builds materials from these, index.html styles the HUD
// from the same six, so the screenshots and the scene can never drift apart.
export const PALETTE = {
  canvas: 0x12161b, // fog and sky
  concrete: 0x555b60,
  gunmetal: 0x2b3038,
  rust: 0x8a4b2a,
  rustDark: 0x5f3319,
  sodium: 0xffb347, // key light, muzzle flash, the accent
  teal: 0x3e6e75, // sea-light fill
  ink: 0xede6da,
  union: 0xd97b2f, // attacker team colour (burnt orange)
  watch: 0x4d8a94, // defender team colour (sea teal)
};

// Weapon table. Damage is per pellet at the muzzle; falloff is a multiplier curve by range,
// head/leg scale the body number, pen is the share of damage that ignores armour.
// spread is in degrees: standing still / at full run; bloom adds per shot and decays.
export const WEAPONS = {
  ratchet: {
    name: 'PK-9 Ratchet', slot: 2, price: 0, auto: false, damage: 26, pellets: 1,
    headMult: 4.0, legMult: 0.7, pen: 0.45, rpm: 400, mag: 12, reserve: 36,
    reloadSec: 1.6, spreadStill: 0.6, spreadMove: 3.2, bloom: 0.55, recoil: 1.4,
    range: 38, falloff: 0.55, moveSpeed: 5.3, killReward: 300,
  },
  cinder: {
    name: 'VX-11 Cinder', slot: 1, price: 1250, auto: true, damage: 22, pellets: 1,
    headMult: 4.0, legMult: 0.7, pen: 0.5, rpm: 750, mag: 30, reserve: 90,
    reloadSec: 2.1, spreadStill: 1.2, spreadMove: 4.8, bloom: 0.4, recoil: 0.9,
    range: 30, falloff: 0.5, moveSpeed: 5.4, killReward: 600,
  },
  slagborn: {
    name: 'AR-7 Slagborn', slot: 1, price: 2900, auto: true, damage: 34, pellets: 1,
    headMult: 4.0, legMult: 0.7, pen: 0.7, rpm: 600, mag: 30, reserve: 90,
    reloadSec: 2.6, spreadStill: 0.5, spreadMove: 6.5, bloom: 0.62, recoil: 2.2,
    range: 60, falloff: 0.72, moveSpeed: 5.15, killReward: 300,
  },
  anvil: {
    name: 'M-90 Anvil', slot: 1, price: 1800, auto: false, damage: 13, pellets: 8,
    headMult: 2.5, legMult: 0.7, pen: 0.2, rpm: 90, mag: 7, reserve: 28,
    reloadSec: 3.4, spreadStill: 6.0, spreadMove: 9.0, bloom: 0, recoil: 6.0,
    range: 16, falloff: 0.3, moveSpeed: 5.25, killReward: 900,
  },
};
export const GRENADE = { name: 'Ember', price: 300, damage: 110, radius: 6, fuseSec: 1.4, throwSpeed: 19 };
export const ARMOR_PRICE = 650;

// Buy menu order: number keys 1..6 buy these rows in hud.js.
export const BUY_ROWS = [
  { key: 'cinder', label: WEAPONS.cinder.name },
  { key: 'slagborn', label: WEAPONS.slagborn.name },
  { key: 'anvil', label: WEAPONS.anvil.name },
  { key: 'ratchet', label: WEAPONS.ratchet.name },
  { key: 'armor', label: 'Kevlar Vest' },
  { key: 'grenade', label: 'Ember Grenade' },
];

export const ECONOMY = {
  startMoney: 800,
  winReward: 2700,
  lossReward: 1900,
  plantTeamReward: 300,
  plantPlayerReward: 300,
  maxMoney: 16000,
};

export const ROUND = {
  buySec: 12,
  liveSec: 100,
  bombSec: 35,
  plantSec: 3.2,
  defuseSec: 6,
  endSec: 5,
  roundsToWin: 8,
  maxRounds: 15,
};

export const ACTOR = {
  radius: 0.38,
  standEye: 1.62,
  crouchEye: 1.05,
  health: 100,
  walkAccel: 62,
  friction: 9,
  walkSpeed: 2.7, // quiet: bots cannot hear it past a few metres
  crouchSpeed: 1.9,
  jumpSpeed: 4.4,
  gravity: 12.5,
};

// How far each noise carries to bot ears, in metres. Shooting gives you away; crouching
// and walking do not. rounds.js and weapons.js publish noises, bots.js listens.
export const NOISE = { shot: 42, reload: 10, sprint: 12, walk: 4, land: 8 };
