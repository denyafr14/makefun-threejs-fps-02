// map.js — SLAGPOINT as data. A decommissioned copper smelter on a tidal dock: three lanes
// (the Culvert west, the Furnace Hall centre, the Conveyor Run east) feeding two plant
// sites on the north side — the Basin (A) and the Casting Floor (B). Union spawns south,
// the Watch spawns north. Everything solid is an axis-aligned brush {x, z, w, d, h, kind};
// collision.js collides against this list and world.js builds the meshes from it, so the
// map you see is exactly the map you bump into.
//
// Cover heights are chosen on purpose: 1.1 m weirs and ingots are crouch-peek cover,
// 1.9 m blocks hide a standing player, 2.6 m containers break sightlines entirely.

// kind: wall (4.2 m building wall) | furnace (the 9 m stack) | container | machine |
//       block (1.9 m solid cover) | cover (1.1 m crouch cover)
export const BRUSHES = [
  // boundary
  { x: 0, z: 36.5, w: 94, d: 1, h: 5, kind: 'wall' }, { x: 0, z: -36.5, w: 94, d: 1, h: 5, kind: 'wall' },
  { x: -46.5, z: 0, w: 1, d: 74, h: 5, kind: 'wall' }, { x: 46.5, z: 0, w: 1, d: 74, h: 5, kind: 'wall' },
  // lane dividers (gaps at z -10..-2 south and z 10..18 north are the lane connectors)
  { x: -33, z: -23, w: 1.2, d: 26, h: 4.2, kind: 'wall' }, { x: -33, z: 4, w: 1.2, d: 12, h: 4.2, kind: 'wall' }, { x: -33, z: 27, w: 1.2, d: 18, h: 4.2, kind: 'wall' },
  { x: 33, z: -23, w: 1.2, d: 26, h: 4.2, kind: 'wall' }, { x: 33, z: 4, w: 1.2, d: 12, h: 4.2, kind: 'wall' }, { x: 33, z: 27, w: 1.2, d: 18, h: 4.2, kind: 'wall' },
  // furnace hall south wall (door gap x -6..6) and north wall (door gap x -4..4)
  { x: -13, z: -12, w: 14, d: 1.2, h: 4.2, kind: 'wall' }, { x: 13, z: -12, w: 14, d: 1.2, h: 4.2, kind: 'wall' },
  { x: -14, z: 12, w: 12, d: 1.2, h: 4.2, kind: 'wall' }, { x: -6, z: 12, w: 4, d: 1.2, h: 4.2, kind: 'wall' },
  { x: 6, z: 12, w: 4, d: 1.2, h: 4.2, kind: 'wall' }, { x: 14, z: 12, w: 12, d: 1.2, h: 4.2, kind: 'wall' },
  // site south walls (door gaps at x -37..-26 into A and x 26..37 into B; the outer
  // ends stop short of the lane dividers, so each lane slips past its site's wall)
  { x: -41.5, z: 12, w: 9, d: 1.2, h: 4.2, kind: 'wall' }, { x: -23, z: 12, w: 6, d: 1.2, h: 4.2, kind: 'wall' },
  { x: 41.5, z: 12, w: 9, d: 1.2, h: 4.2, kind: 'wall' }, { x: 23, z: 12, w: 6, d: 1.2, h: 4.2, kind: 'wall' },
  // the furnace stack and its two charging machines — mid is two flues around it
  { x: 0, z: 0, w: 7, d: 7, h: 9, kind: 'furnace' },
  { x: -10, z: 5.5, w: 4, d: 3, h: 1.9, kind: 'machine' }, { x: 10, z: 5.5, w: 4, d: 3, h: 1.9, kind: 'machine' },
  // container cross in the hall
  { x: -8, z: 9.5, w: 5, d: 2.4, h: 2.6, kind: 'container', tone: 'teal' }, { x: 8, z: 9.5, w: 5, d: 2.4, h: 2.6, kind: 'container', tone: 'rust' },
  { x: -8, z: -10.5, w: 5, d: 2.4, h: 2.6, kind: 'container', tone: 'rust' }, { x: 8, z: -10.5, w: 5, d: 2.4, h: 2.6, kind: 'container', tone: 'teal' },
  // Site A — the Basin: concrete weirs and a pump housing
  { x: -33.5, z: 20.5, w: 4, d: 1, h: 1.1, kind: 'cover' }, { x: -27, z: 24.5, w: 1, d: 4, h: 1.1, kind: 'cover' },
  { x: -31, z: 26, w: 4, d: 1, h: 1.1, kind: 'cover' }, { x: -24, z: 16, w: 3, d: 3, h: 1.9, kind: 'block' },
  // Site B — the Casting Floor: ingot stacks and a ladle shell (the plant spot itself
  // stays bare: the charge needs the middle of the floor)
  { x: 26, z: 17, w: 3, d: 1.2, h: 1.1, kind: 'cover' }, { x: 34.2, z: 22.5, w: 3, d: 1.2, h: 1.1, kind: 'cover' },
  { x: 27, z: 25, w: 3, d: 1.2, h: 1.1, kind: 'cover' }, { x: 37, z: 17, w: 1.2, d: 3, h: 1.1, kind: 'cover' },
  { x: 24, z: 27, w: 2.6, d: 2.6, h: 1.9, kind: 'block' },
  // lane cover, tucked against the outer walls so the lane's walking line stays open
  { x: -41.5, z: -18, w: 2, d: 2, h: 1.1, kind: 'cover' }, { x: -41, z: 2, w: 2, d: 2, h: 1.9, kind: 'block' }, { x: -42, z: 24, w: 2, d: 2, h: 1.1, kind: 'cover' },
  { x: 41.5, z: -18, w: 2, d: 2, h: 1.1, kind: 'cover' }, { x: 41, z: 2, w: 2, d: 2, h: 1.9, kind: 'block' }, { x: 42, z: -28, w: 2, d: 2, h: 1.1, kind: 'cover' },
  // spawn yards
  { x: -14, z: -24, w: 3, d: 1.5, h: 1.1, kind: 'cover' }, { x: 14, z: -24, w: 3, d: 1.5, h: 1.1, kind: 'cover' },
  { x: -22, z: -19, w: 4, d: 1.5, h: 1.9, kind: 'block' }, { x: 22, z: -19, w: 4, d: 1.5, h: 1.9, kind: 'block' },
  { x: -14, z: 31, w: 3, d: 1.5, h: 1.1, kind: 'cover' }, { x: 14, z: 31, w: 3, d: 1.5, h: 1.1, kind: 'cover' },
];

export const SITES = {
  A: { id: 'A', name: 'The Basin', x: -29.5, z: 20, hx: 5.5, hz: 7 },
  B: { id: 'B', name: 'The Casting Floor', x: 29.5, z: 20, hx: 5.5, hz: 7 },
};

export const SPAWNS = {
  0: [{ x: -4, z: -31 }, { x: 4, z: -31 }, { x: -10, z: -29 }, { x: 10, z: -29 }, { x: 0, z: -33 }], // Union
  1: [{ x: -4, z: 31 }, { x: 4, z: 31 }, { x: -10, z: 29 }, { x: 10, z: 29 }, { x: 0, z: 33 }], // Watch
};

// Waypoint graph. Bots path over these nodes (breadth-first in bots.js); every edge was
// checked to run clear of the brushes above, so a bot walking node to node never has to
// scrape along a wall. yaw convention: 0 faces -Z (north), PI faces +Z (south).
export const NODES = [
  { x: 0, z: -30 }, { x: -16, z: -28 }, { x: 16, z: -28 }, { x: -39, z: -24 }, { x: -39, z: -6 },
  { x: -39, z: 8 }, { x: -39, z: 24 }, { x: -24, z: -6 }, { x: -12, z: -8 }, { x: 0, z: -16 },
  { x: 12, z: -8 }, { x: 24, z: -6 }, { x: 39, z: -24 }, { x: 39, z: -6 }, { x: 39, z: 8 },
  { x: 39, z: 24 }, { x: -13, z: 0 }, { x: 13, z: 0 }, { x: -12, z: 9 }, { x: 12, z: 9 },
  { x: 0, z: 17 }, { x: -28, z: 15 }, { x: -31, z: 21 }, { x: -36, z: 30 }, { x: 28, z: 15 },
  { x: 31, z: 21 }, { x: 36, z: 30 }, { x: 0, z: 30 }, { x: -18, z: 30 }, { x: 18, z: 30 },
  { x: 0, z: -24 }, { x: 0, z: -8 },
  { x: -35.2, z: 8 }, { x: -35.2, z: 16 }, { x: 35.2, z: 8 }, { x: 35.2, z: 16 }, // lane slips past the sites
];
// Every edge was walked against the brush list: it must not cross a brush, because a
// bot steers straight at its next node. (The lane dividers run to the south wall, so
// the lanes join the yard only through their z -10..-2 gaps; the north strip is cut
// by the same dividers, so its ends are reached through the sites, not along it.)
export const EDGES = [
  [0, 1], [0, 2], [0, 30], [30, 9], [1, 7], [2, 11], [3, 4], [4, 5], [5, 32],
  [4, 7], [7, 8], [8, 31], [8, 16], [9, 31], [31, 10], [31, 16], [10, 11], [10, 17], [11, 13],
  [12, 13], [13, 14], [14, 34], [14, 24], [5, 21], [6, 23], [21, 22], [32, 33], [33, 6],
  [22, 20], [18, 16], [19, 17], [24, 25], [24, 20], [15, 26], [34, 35], [35, 15],
  [20, 27], [27, 28], [27, 29],
];

export const ADJACENCY = (() => {
  const adj = NODES.map(() => []);
  for (const [a, b] of EDGES) { adj[a].push(b); adj[b].push(a); }
  return adj;
})();

export function nearestNode(x, z) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    const dx = NODES[i].x - x, dz = NODES[i].z - z, d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Where the Watch set up at round start: node + the yaw they hold. Two on each site,
// one watching the furnace doors; the Union's routes decide which pair gets the fight.
export const HOLDS = [
  { node: 21, yaw: Math.PI }, { node: 22, yaw: Math.PI * 0.9 },
  { node: 24, yaw: Math.PI }, { node: 25, yaw: Math.PI * 1.1 },
  { node: 20, yaw: Math.PI },
];

// Bot callsigns, painted on their backs in world.js. The player is YOU.
export const NAMES = {
  0: ['ASH', 'BRINE', 'COPPER', 'DREDGE'],
  1: ['HARBOR', 'LANTERN', 'MOORING', 'SEXTANT', 'TIDE'],
};
