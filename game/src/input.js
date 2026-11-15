// input.js — keyboard and mouse, nothing else. It fills one preallocated intent object
// that player.js reads each tick; edge-triggered presses are queued so a tap between
// frames is never lost. Pointer lock is requested by main.js from the Play button.

export const input = {
  keys: new Set(), // codes currently held ('KeyW', 'Space', ...)
  pressed: [], // codes that went down since the last consumePresses()
  lookDX: 0, lookDY: 0, // accumulated mouse movement, drained by player.js
  firing: false, // left mouse held
  locked: false,
};

let listening = false;

export function initInput(canvas) {
  if (listening) return;
  listening = true;
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    if (!input.keys.has(e.code)) input.pressed.push(e.code);
    input.keys.add(e.code);
  });
  addEventListener('keyup', (e) => input.keys.delete(e.code));
  addEventListener('blur', () => { input.keys.clear(); input.firing = false; });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked) { input.keys.clear(); input.firing = false; }
  });
  addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.lookDX += e.movementX || 0;
    input.lookDY += e.movementY || 0;
  });
  addEventListener('mousedown', (e) => { if (input.locked && e.button === 0) input.firing = true; });
  addEventListener('mouseup', (e) => { if (e.button === 0) input.firing = false; });
  canvas.addEventListener('click', () => {
    if (!input.locked && !document.body.dataset.demo) canvas.requestPointerLock();
  });
}

export function consumePresses() {
  const out = input.pressed.slice();
  input.pressed.length = 0;
  return out;
}

export function drainLook() {
  const dx = input.lookDX, dy = input.lookDY;
  input.lookDX = 0; input.lookDY = 0;
  return [dx, dy];
}
