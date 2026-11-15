// hud.js — the DOM overlay: health and armour, ammunition, money, the round clock and
// score, killfeed, banner, plant/defuse progress, the buy menu, the spread-true
// crosshair, and a minimap drawn from the same map data the bots path over. It only
// reads state; the one thing it writes is buy intent, forwarded to rounds.buy().

import { BUY_ROWS, WEAPONS, GRENADE, ARMOR_PRICE } from './config.js';
import { state, roundClockLeft, TEAM } from './state.js';
import { BRUSHES, SITES } from './map.js';
import { currentDef, spreadDegrees } from './weapons.js';
import { buy } from './rounds.js';

const el = {};
let feedCache = '', buyCache = '', mapLastDraw = 0;
export let buyOpen = false;

export function initHud() {
  for (const id of ['hud', 'timer', 'score-us', 'score-them', 'round-label', 'hp-num', 'hp-bar',
    'armor-num', 'armor-fill', 'money', 'weapon-name', 'ammo', 'ammo-mag', 'ammo-reserve',
    'grenades', 'reload-note', 'killfeed', 'banner', 'banner-title', 'banner-sub',
    'plant-wrap', 'plant-label', 'buy-menu', 'buy-items', 'crosshair', 'hitmarker',
    'vignette', 'scope-note', 'minimap']) {
    el[id] = document.getElementById(id);
  }
  el.ctx = el.minimap.getContext('2d');
}

export function toggleBuy(force) {
  buyOpen = force !== undefined ? force : !buyOpen;
}

export function handleBuyKey(code) {
  if (state.phase !== 'buy') return;
  if (code === 'KeyB') { toggleBuy(); return; }
  const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(code);
  if (idx >= 0 && BUY_ROWS[idx]) buy(state.player, BUY_ROWS[idx].key);
}

function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function drawMinimap() {
  const g = el.ctx, W = 184, H = 144;
  const X = (x) => (x + 47) / 94 * W, Z = (z) => (37 - z) / 74 * H;
  g.fillStyle = 'rgba(18,22,27,0.9)';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#39424e';
  for (const b of BRUSHES) {
    if (b.kind === 'furnace') g.fillStyle = '#8a4b2a';
    else if (b.kind === 'container') g.fillStyle = '#5f3319';
    else g.fillStyle = '#39424e';
    g.fillRect(X(b.x - b.w / 2), Z(b.z + b.d / 2), b.w / 94 * W, b.d / 74 * H);
  }
  g.font = '700 11px system-ui'; g.textAlign = 'center';
  for (const id of ['A', 'B']) {
    const s = SITES[id];
    g.strokeStyle = '#ffb347'; g.lineWidth = 1;
    g.strokeRect(X(s.x - s.hx), Z(s.z + s.hz), s.hx * 2 / 94 * W, s.hz * 2 / 74 * H);
    g.fillStyle = '#ffb347';
    g.fillText(id, X(s.x), Z(s.z) + 4);
  }
  if (state.bomb.state === 'planted' || state.bomb.state === 'defusing') {
    g.fillStyle = Math.sin(state.time * 6) > 0 ? '#e4572e' : '#ffb347';
    g.beginPath(); g.arc(X(state.bomb.pos.x), Z(state.bomb.pos.z), 3.4, 0, 7); g.fill();
  }
  for (const a of state.actors) {
    if (!a.alive) continue;
    if (a.isPlayer) {
      g.fillStyle = '#ede6da';
      g.beginPath(); g.arc(X(a.pos.x), Z(a.pos.z), 3, 0, 7); g.fill();
      g.strokeStyle = '#ede6da';
      g.beginPath(); g.moveTo(X(a.pos.x), Z(a.pos.z));
      g.lineTo(X(a.pos.x) - Math.sin(a.yaw) * 7, Z(a.pos.z) - Math.cos(a.yaw) * 7); g.stroke();
    } else {
      g.fillStyle = a.team === TEAM.UNION ? '#d97b2f' : '#4d8a94';
      g.beginPath(); g.arc(X(a.pos.x), Z(a.pos.z), 2.2, 0, 7); g.fill();
    }
  }
}

export function syncHud() {
  const p = state.player;
  if (!p) return;
  const phase = state.phase;
  // clock + score
  el.timer.textContent = state.demo ? state.demoTimer ?? fmtTime(roundClockLeft()) : fmtTime(roundClockLeft());
  el.timer.className = state.bomb.state === 'planted' || state.bomb.state === 'defusing'
    ? 'planted' : (roundClockLeft() < 10 && phase === 'live' ? 'low' : '');
  el['score-us'].textContent = state.score[0];
  el['score-them'].textContent = state.score[1];
  el['round-label'].textContent = state.matchOver
    ? 'Match over' : `Round ${state.round} — ${phase === 'buy' ? 'buy phase' : phase === 'planted' ? 'charge planted' : phase}`;
  // vitals
  el['hp-num'].textContent = Math.max(0, Math.ceil(p.health));
  el['hp-num'].className = p.health <= 30 ? 'hurt' : '';
  el['hp-bar'].style.width = `${Math.max(0, p.health)}%`;
  el['armor-num'].textContent = `AP ${Math.ceil(p.armor)}`;
  el['armor-fill'].style.width = `${Math.max(0, p.armor)}%`;
  el.money.textContent = `$${p.money.toLocaleString('en-US')}`;
  // weapon
  const def = currentDef(p);
  el['weapon-name'].textContent = def.name;
  el['ammo-mag'].textContent = p.mag;
  el['ammo-reserve'].textContent = `/ ${p.reserve}`;
  el.ammo.className = p.mag === 0 ? 'empty' : '';
  el.grenades.textContent = `EMBER × ${p.grenades} — press G`;
  el['reload-note'].textContent = p.reloadingUntil && state.time < p.reloadingUntil ? 'RELOADING…' : (p.mag === 0 ? 'PRESS R' : '');
  // crosshair gap from the true spread, hitmarker from the last confirmed hit
  const spreadPx = 3 + spreadDegrees(p, def) * 5.5;
  el.crosshair.style.setProperty('--sp', `${spreadPx.toFixed(1)}px`);
  const hm = state.playerHitmark;
  const hmOn = hm && state.time - hm.at < 0.14;
  el.hitmarker.className = hmOn ? `on${hm.kill ? ' kill' : ''}` : '';
  el.vignette.style.opacity = state.playerHurtAt && state.time - state.playerHurtAt < 0.5
    ? String(0.85 * (1 - (state.time - state.playerHurtAt) / 0.5)) : (p.health <= 30 && p.alive ? '0.35' : '0');
  // killfeed (rebuilt only when it changes)
  const feedKey = state.feed.length + '|' + (state.feed.length ? state.feed[state.feed.length - 1].at : 0);
  if (feedKey !== feedCache) {
    feedCache = feedKey;
    el.killfeed.innerHTML = state.feed.slice(-4).map((f) => `<div>${f.html}</div>`).join('');
  }
  // banner
  if (state.banner && state.time < state.banner.until) {
    el.banner.className = 'on';
    el['banner-title'].textContent = state.banner.title;
    el['banner-sub'].textContent = state.banner.sub;
  } else {
    el.banner.className = '';
  }
  // plant / defuse progress
  const chan = state.bomb.state === 'planting' || state.bomb.state === 'defusing';
  el['plant-wrap'].hidden = !chan;
  if (chan) {
    el['plant-label'].textContent = state.bomb.state === 'planting' ? 'PLANTING THE CHARGE' : 'DEFUSING THE CHARGE';
    el['plant-wrap'].querySelector('#plant-bar i').style.width = `${Math.min(100, state.bomb.progress * 100)}%`;
  }
  el['scope-note'].hidden = !(phase === 'live' && state.bomb.carrier === p && !chan);
  // buy menu
  const showBuy = phase === 'buy' && buyOpen;
  el['buy-menu'].hidden = !showBuy;
  if (showBuy) {
    // one character per row ('o' owned, 'p' too poor, 'y' buyable) so key[i] below
    // lines up with BUY_ROWS[i] — an empty string would shift every later row
    const key = BUY_ROWS.map((r) => {
      if (r.key === 'armor') return p.armor >= 100 ? 'o' : p.money < ARMOR_PRICE ? 'p' : 'y';
      if (r.key === 'grenade') return p.grenades >= 2 ? 'o' : p.money < GRENADE.price ? 'p' : 'y';
      return (p.weapons.primary === r.key || p.weapons.sidearm === r.key) ? 'o' : p.money < WEAPONS[r.key].price ? 'p' : 'y';
    }).join('') + '|' + p.money;
    if (key !== buyCache) {
      buyCache = key;
      el['buy-items'].innerHTML = BUY_ROWS.map((r, i) => {
        const price = r.key === 'armor' ? ARMOR_PRICE : r.key === 'grenade' ? GRENADE.price : WEAPONS[r.key].price;
        const cls = key[i] === 'o' ? 'owned' : key[i] === 'p' ? 'poor' : '';
        const tag = key[i] === 'o' ? 'OWNED' : `$${price}`;
        return `<div class="buy-item ${cls}"><span><kbd>${i + 1}</kbd>${r.label}</span><span class="price">${tag}</span></div>`;
      }).join('');
    }
  }
  if (state.time - mapLastDraw > 0.15) {
    mapLastDraw = state.time;
    drawMinimap();
  }
}
