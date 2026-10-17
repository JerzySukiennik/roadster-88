// Roadster 88 menu: title screen over a live, slowly orbiting shot of the car, and the same sheet as the in-game pause menu (play or resume, map, garage, settings, controls, credits) with mouse and keyboard navigation.
import * as THREE from 'three/webgpu';
import { PAINTS } from './render/carMaterials.js';
import { PRESETS } from './render/gfx.js';
import { OUTFITS } from './render/driver.js';

const KEYS = [['W', 'Drive, rear thrust'], ['S', 'Brake, reverse, retro'], ['A  D', 'Steer, yaw'], ['Shift', 'Boost'], ['Shift + S', 'Retro brake'], ['Space', 'Tap to hop, hold to lift'], ['Ctrl', 'Descend'], ['Arrows', 'Pitch and roll'], ['Mouse', 'Look'], ['Click', 'Touch the screen (cockpit)'], ['C', 'Cockpit or chase camera'], ['Y', 'Type a destination year'], ['T', 'Arm time circuits'], ['F', 'Get out or get in'], ['R', 'New Roadster'], ['Esc', 'Menu'], ['On foot', 'W A S D walk, Shift run, Space jump'], ['E', 'Pick up, drop, use (on foot)'], ['Click', 'Throw what you carry']];
const SWATCH = { red: '#a3121a', white: '#e9e8e4', black: '#111214', silver: '#6c7078', blue: '#173a8a' };

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }

export class Menu {
  constructor(game) {
    this.g = game;
    this.root = document.getElementById('menu');
    this.nav = document.getElementById('menuNav');
    this.panel = document.getElementById('menuPanel');
    this.foot = document.getElementById('menuFoot');
    this.mode = null; this.section = 'map'; this.items = []; this.focus = 0;
    this.orbit = 0.6; this.blend = 0; this.leaving = false;
    this._p = new THREE.Vector3(); this._l = new THREE.Vector3(); this._f = new THREE.Vector3(); this._r = new THREE.Vector3();
    addEventListener('keydown', (e) => this.key(e));
  }

  get open() { return this.mode !== null; }

  maps() {
    const g = this.g;
    if (Array.isArray(g.maps) && g.maps.length) return g.maps;
    return [{ id: 'plate', name: 'Test plate', desc: 'Ramps, ravines, towers, loop and crash zone', ready: true }, { id: 'valley', name: 'Valley', desc: 'Californian valley in seven eras', ready: false }];
  }

  showTitle() { this.mode = 'title'; this.leaving = false; this.section = 'map'; this.build(); this.root.classList.remove('hidden'); this.root.classList.add('title'); this.root.classList.remove('pause'); }

  showPause() { this.mode = 'pause'; this.leaving = false; this.section = 'settings'; this.build(); this.root.classList.remove('hidden', 'title'); this.root.classList.add('pause'); }

  hide() { this.mode = null; this.root.classList.add('hidden'); }

  build() {
    const g = this.g, title = this.mode === 'title';
    const entries = [
      { id: 'play', label: title ? 'Play' : 'Resume', primary: true, act: () => this.play() },
      { id: 'map', label: 'Map' },
      { id: 'garage', label: 'Garage' },
      { id: 'settings', label: 'Settings' },
      { id: 'controls', label: 'Controls' },
      { id: 'credits', label: 'Credits' },
    ];
    if (!title) entries.push({ id: 'title', label: 'Main menu', act: () => this.toTitle() });
    this.nav.innerHTML = '';
    this.items = entries.map((en, i) => {
      const b = el('button', 'menu-item' + (en.primary ? ' primary' : ''), en.label);
      b.onmouseenter = () => this.setFocus(i, true);
      b.onclick = () => { this.setFocus(i, true); if (en.act) en.act(); };
      this.nav.appendChild(b);
      return { ...en, el: b };
    });
    const start = Math.max(0, this.items.findIndex((x) => x.id === (title ? 'play' : 'play')));
    this.setFocus(start, false);
    this.renderPanel();
    const car = g.car && g.car.view && !g.car.view.placeholder ? 'Roadster 2026' : 'placeholder car';
    const on = g.online && g.online.status === 'online' ? ` · ${g.online.count} online` : '';
    this.foot.textContent = `${g.gfx.backend} · ${car}${on}`;
  }

  setFocus(i, sound) {
    this.focus = (i + this.items.length) % this.items.length;
    this.items.forEach((it, k) => it.el.classList.toggle('on', k === this.focus));
    const it = this.items[this.focus];
    if (!it.act && it.id !== this.section) { this.section = it.id; this.renderPanel(); }
    if (sound && this.g.audio) this.g.audio.play('ui_tap', { inside: true, gain: 0.25 });
  }

  key(e) {
    if (!this.open) return;
    if (e.code === 'ArrowDown') { this.setFocus(this.focus + 1, true); e.preventDefault(); }
    else if (e.code === 'ArrowUp') { this.setFocus(this.focus - 1, true); e.preventDefault(); }
    else if (e.code === 'Enter' || e.code === 'Space') { const it = this.items[this.focus]; if (it.act) it.act(); e.preventDefault(); }
  }

  seg(items, get, set) {
    const s = el('div', 'seg');
    const paint = () => { for (const b of s.children) b.classList.toggle('on', b.dataset.k === String(get())); };
    for (const [k, label] of items) { const b = el('button', '', label); b.dataset.k = k; b.onclick = () => { set(k); paint(); if (this.g.audio) this.g.audio.play('ui_toggle', { inside: true, gain: 0.4 }); }; s.appendChild(b); }
    paint();
    return s;
  }

  row(label, control) { const r = el('div', 'menu-row'); r.appendChild(el('span', '', label)); r.appendChild(control); return r; }

  renderPanel() {
    const g = this.g, P = this.panel;
    P.innerHTML = '';
    P.classList.remove('show'); void P.offsetWidth; P.classList.add('show');
    const head = (t, sub) => { P.appendChild(el('div', 'panel-title', t)); if (sub) P.appendChild(el('div', 'panel-sub', sub)); };
    if (this.section === 'map') {
      head('Map', 'Where the Roadster starts.');
      const cur = g.mapId || 'plate';
      const grid = el('div', 'tiles');
      for (const m of this.maps()) {
        const t = el('button', 'tile' + (m.id === cur ? ' on' : '') + (m.ready ? '' : ' soon'), `<b>${m.name}</b><span>${m.ready ? m.desc : 'Coming soon'}</span>`);
        t.disabled = !m.ready;
        t.onclick = () => { if (!m.ready || m.id === cur) return; const q = new URLSearchParams(location.search); q.set('map', m.id); location.search = q.toString(); };
        grid.appendChild(t);
      }
      P.appendChild(grid);
    } else if (this.section === 'garage') {
      head('Garage', 'Paint, roof, wing and the driver.');
      const sw = el('div', 'swatches');
      for (const [k, p] of Object.entries(PAINTS)) {
        const b = el('button', 'swatch' + (g.settings.paint === k ? ' on' : ''));
        b.style.setProperty('--c', SWATCH[k] || '#888'); b.title = p.label;
        b.appendChild(el('i')); b.appendChild(el('span', '', p.label.replace(' Multi-Coat', '').replace(' Metallic', '')));
        b.onclick = () => { g.setPaint(k); for (const x of sw.children) x.classList.toggle('on', x === b); if (g.audio) g.audio.play('ui_toggle', { inside: true, gain: 0.4 }); };
        sw.appendChild(b);
      }
      P.appendChild(sw);
      P.appendChild(this.row('Targa roof', this.seg([['on', 'On'], ['off', 'Off']], () => (g.settings.roof ? 'on' : 'off'), (k) => g.setRoof(k === 'on'))));
      P.appendChild(this.row('Rear wing', this.seg([['on', 'Up'], ['off', 'Stowed']], () => (g.settings.wing ? 'on' : 'off'), (k) => g.setWing(k === 'on'))));
      P.appendChild(this.row('Doors', this.seg([['open', 'Open'], ['closed', 'Closed']], () => (g.car.view.doorTarget > 0.5 ? 'open' : 'closed'), (k) => { if ((k === 'open') !== (g.car.view.doorTarget > 0.5)) g.car.view.toggleDoors(); })));
      P.appendChild(this.row('Driver', this.seg(OUTFITS.map((o, i) => [String(i), o.label]), () => String(g.store.get('outfit', 0)), (k) => g.setOutfit(Number(k)))));
    } else if (this.section === 'settings') {
      head('Settings');
      P.appendChild(this.row('Quality', this.seg(Object.entries(PRESETS).map(([k, v]) => [k, v.label]), () => g.gfx.presetName, (k) => { g.gfx.setPreset(k); g.store.set('quality', k); })));
      P.appendChild(this.row('Flight assist', this.seg([['on', 'On'], ['off', 'Off']], () => (g.settings.assist ? 'on' : 'off'), (k) => g.setAssist(k === 'on'))));
      P.appendChild(this.row('Radio', this.seg([['on', 'On'], ['off', 'Off']], () => (g.settings.radio ? 'on' : 'off'), (k) => g.setRadio(k === 'on'))));
      if (g.online) {
        P.appendChild(this.row('Online', this.seg([['on', 'On'], ['off', 'Off']], () => (g.online.enabled ? 'on' : 'off'), (k) => { g.online.setEnabled(k === 'on'); this.renderPanel(); })));
        const inp = el('input', 'name-input'); inp.value = g.online.name; inp.maxLength = 20; inp.spellcheck = false;
        inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); };
        inp.onchange = () => { g.online.setName(inp.value); inp.value = g.online.name; };
        P.appendChild(this.row('Name', inp));
        P.appendChild(el('div', 'panel-note', g.online.status === 'online' ? `${g.online.count} online in this era` : g.online.status === 'connecting' ? 'Connecting...' : g.online.enabled ? 'Offline' : 'Single player'));
      }
      const W = g.weather;
      if (W && Array.isArray(W.kinds) && W.set) P.appendChild(this.row('Weather', this.seg([['auto', 'Auto'], ...W.kinds.map((k) => [k, k[0].toUpperCase() + k.slice(1)])], () => W.override || 'auto', (k) => W.set(k === 'auto' ? null : k))));
      P.appendChild(el('div', 'panel-note', `${g.gfx.backend} · ${Math.round(g.gfx.scale * 100)}% resolution`));
    } else if (this.section === 'controls') {
      head('Controls', 'Keyboard and mouse.');
      const k = el('div', 'keys');
      k.innerHTML = KEYS.map(([a, b]) => `<div><b>${a}</b><span>${b}</span></div>`).join('');
      P.appendChild(k);
    } else if (this.section === 'credits') {
      head('Credits');
      P.appendChild(el('div', 'credits', '<p><b>Roadster 88</b> by Jurek, Gzowo Space Program.</p><p>Built with Claude, three.js and Rapier. The car, driver, sounds and effects are made for this game. Third-party sounds and textures are CC0 or CC-BY.</p><p><a href="../CREDITS.md" target="_blank" rel="noopener">Full credits</a></p>'));
    }
  }

  play() {
    const g = this.g;
    if (this.mode === 'title') { this.leaving = true; this.blend = 0; }
    this.hide();
    g.resumeFromMenu();
  }

  toTitle() {
    const g = this.g;
    g.rig.mode = 'chase';
    this.showTitle();
    g.paused = true;
  }

  update(dt) {
    const g = this.g, rig = g.rig, car = g.car;
    if (!car) return;
    const c = car.pose.pos, q = car.pose.quat;
    if (this.mode === 'title') {
      this.orbit += dt * 0.09;
      const fwd = this._f.set(0, 0, 1).applyQuaternion(q).setY(0).normalize();
      const yaw = Math.atan2(fwd.x, fwd.z) + this.orbit;
      const r = 9.2, h = 1.4;
      const pos = this._p.set(c.x + Math.sin(yaw) * r, c.y + h, c.z + Math.cos(yaw) * r);
      const right = this._r.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const wide = innerWidth > 760 ? 2.0 : 0;
      const look = this._l.set(c.x, c.y + 0.5, c.z).addScaledVector(right, -wide);
      rig.hold = rig.hold && rig.hold.menu ? rig.hold : { menu: true, pos: new THREE.Vector3(), look: new THREE.Vector3() };
      rig.hold.pos.copy(pos); rig.hold.look.copy(look); rig.hold.blend = undefined; rig.hold.fov = 38;
    } else if (this.leaving) {
      this.blend = Math.min(1, this.blend + dt / 1.1);
      if (rig.hold && rig.hold.menu) rig.hold.blend = this.blend * this.blend * (3 - 2 * this.blend);
      if (this.blend >= 1) { this.leaving = false; if (rig.hold && rig.hold.menu) rig.hold = null; }
    }
  }
}
