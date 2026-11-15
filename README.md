# SLAGPOINT — a three.js tactical FPS

A round-based tactical shooter for make.fun's **threejs-fps-02**, in the style
Counter-Strike made famous but with its own map, teams, weapons and names throughout.

The night shift at a decommissioned copper smelter. The **Union** crew (you, plus four
bots) attacks: fight across the yard and plant the charge on one of two sites — **the
Basin** (A) or **the Casting Floor** (B) — then hold it for 35 seconds. The **Watch**
(five bots) defends, rotates, and defuses. First to 8 rounds, money between rounds,
accuracy over speed.

## Play it

```
node serve.ts        # serves game/ at http://localhost:8080
```

Open the page in desktop Chrome, click Play. No build step, no network: the game is
static ES modules under `game/`, three.js 0.187.0 vendored beside them.

| Keys | |
|---|---|
| WASD / mouse | move / look — stopping stills your aim |
| Click / R | fire / reload |
| Ctrl / Shift / Space | crouch / walk quiet / jump |
| 1 / 2, G | primary / sidearm, throw Ember grenade |
| E | plant (at a site) — the Watch defuses the same way |
| B, then 1–6 | buy menu during the buy phase |

## What's in the game

- **Gunplay with a lesson in it.** Head/torso/leg hitboxes (head ×4), per-weapon
  recoil with recovery, and a spread model where moving, jumping and spraying all
  cost accuracy and crouching buys it back. The crosshair gap is the true spread.
- **Bots with a plan.** Nine bots path a waypoint graph across three lanes (Culvert,
  Furnace Hall, Conveyor Run), hold angles, peek, react to sight *and* sound —
  sprinting and shooting are loud, walking and crouching are not — push sites behind
  the charge carrier, fetch a dropped charge, and converge to defuse once it's down.
- **A full round economy.** $800 start, kill/win/loss rewards, a six-row buy menu
  (VX-11 Cinder SMG, AR-7 Slagborn rifle, M-90 Anvil shotgun, PK-9 Ratchet sidearm,
  kevlar, Ember grenades), armour that stops the non-penetrating share of damage.
- **An original map.** SLAGPOINT's smelter yard: a 9 m furnace stack splitting mid
  into two flues, container crosses, crouch-height weirs and ingot stacks on the
  sites, a casting crane over B — all collision exactly as drawn, since the meshes
  and the colliders come from the same brush list.

## Code layout

One job per module under `game/src/`: `state.js` is the only store; `sim.js` steps
the game at a fixed 1/60 s apart from rendering (`render.js`); `map.js` is the map
as data; `collision.js` answers every question about the world's shape; `player.js`,
`bots.js`, `weapons.js`, `combat.js` and `rounds.js` play the game; `world.js` and
`hud.js` draw it; `audio.js` synthesises every sound (no audio files). Total source
is ~107 KB, so the dossier shows all of it.

`main.ts` is the hand-in program: it copies `game/` and `screenshots/` to `/output`
and writes `dossier.json` with the kit's `vendor/makefun-threejs.ts`, unchanged.
The four screenshots are real renders of this code in a browser, staged with the
game's own `?shot=` demo scenes (`cover`, `buy`, `fight`, `plant`).

## License

MIT — see `LICENSE`.
