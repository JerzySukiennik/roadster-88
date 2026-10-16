// Roadster 88 cockpit displays: Tesla-style centre touchscreen (Time Circuits with rolling digits, presets and keypad, Map, Car, Radio) and the small driver cluster, drawn on 2D canvases as textures; gaze-ray hit testing for FPP taps.
import * as THREE from 'three/webgpu';
import { texture, uv, uniform, vec3 } from 'three/tsl';
import { ERAS, formatYear, monthName, pad2, eraOf, cloneDate, clampDate } from '../sim/timetravel.js';
import { PAINTS } from './carMaterials.js';

const W = 1280, H = 800;
const FONT = '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Inter", "Helvetica Neue", Arial, sans-serif';
const C = { bg: '#0b0c0e', panel: '#16181c', line: 'rgba(255,255,255,0.08)', ink: '#f2f3f5', dim: 'rgba(242,243,245,0.5)', faint: 'rgba(242,243,245,0.28)', blue: '#3e8bff', red: '#ff5a4e', green: '#42d17a', amber: '#ffb648' };

function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

export class Cockpit {
  constructor(game) {
    this.g = game;
    this.canvas = document.createElement('canvas'); this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.flipY = false; this.tex.anisotropy = 4;
    this.cl = document.createElement('canvas'); this.cl.width = 512; this.cl.height = 180;
    this.clTex = new THREE.CanvasTexture(this.cl); this.clTex.colorSpace = THREE.SRGBColorSpace; this.clTex.flipY = false;
    this.bright = uniform(2.2);
    this.app = 'tc';
    this.buttons = []; this.hover = null; this.press = null; this.pressT = 0;
    this.roll = new Map();
    this.keypad = null;
    this.timer = 0; this.clTimer = 0; this.dirty = true;
    this.raycaster = new THREE.Raycaster();
    this.hit = null;
  }

  material(tex) {
    const m = new THREE.MeshBasicNodeMaterial({ name: 'Screen', side: THREE.DoubleSide });
    m.colorNode = texture(tex, uv()).rgb.mul(this.bright);
    return m;
  }

  bind(view) {
    const s = view.n.Screen, c = view.n.Cluster;
    if (s && s.isMesh) { this.fixUv(s, view.placeholder); s.material = this.material(this.tex); }
    if (c && c.isMesh) { this.fixUv(c, view.placeholder); c.material = this.material(this.clTex); }
    this.screen = s; this.cluster = c;
    if (s && s.isMesh && !view.placeholder) this.relocate(view, s);
    for (const m of [s, c]) if (m && m.isMesh && !view.placeholder) this.unbury(view, m);
  }

  relocate(view, s) {
    const g = s.geometry; g.computeBoundingBox();
    const bb = g.boundingBox, size = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
    const dims = [size.x, size.y, size.z];
    const ax = dims.indexOf(Math.min(...dims));
    const rest = [0, 1, 2].filter((i) => i !== ax).sort((a, b) => dims[b] - dims[a]);
    const nL = new THREE.Vector3().setComponent(ax, 1);
    const eye = view.n.Eye_Driver ? view.n.Eye_Driver.position.clone() : new THREE.Vector3(0.36, 0.96, -0.52);
    const P = new THREE.Vector3(0.07, 0.87, 0.42);
    s.position.copy(P);
    const want = eye.clone().sub(P).normalize();
    if (nL.clone().applyQuaternion(s.quaternion).dot(want) < 0) nL.negate();
    s.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(nL.clone().applyQuaternion(s.quaternion), want));
    s.scale.setScalar(1.45);
    const mat = this.g.mats.get('Paint_Black') || this.g.mats.get('Interior_Dark');
    const bs = [0, 0, 0]; bs[ax] = 0.018; bs[rest[0]] = dims[rest[0]] * 1.06; bs[rest[1]] = dims[rest[1]] * 1.08;
    const back = new THREE.Mesh(new THREE.BoxGeometry(bs[0], bs[1], bs[2]), mat);
    back.name = 'Screen_Back'; back.position.copy(ctr).addScaledVector(nL, -0.011);
    s.add(back);
    const up = new THREE.Vector3().setComponent(rest[1], 1);
    if (up.clone().applyQuaternion(s.quaternion).y < 0) up.negate();
    const ss = [0, 0, 0]; ss[ax] = 0.025; ss[rest[0]] = 0.06; ss[rest[1]] = 0.16;
    const stem = new THREE.Mesh(new THREE.BoxGeometry(ss[0], ss[1], ss[2]), mat);
    stem.name = 'Screen_Stem'; stem.position.copy(ctr).addScaledVector(up, -(dims[rest[1]] * 0.5 + 0.07)).addScaledVector(nL, -0.03);
    s.add(stem);
    s.updateMatrixWorld(true);
  }

  unbury(view, mesh) {
    view.root.updateMatrixWorld(true);
    const eyeL = view.n.Eye_Driver ? view.n.Eye_Driver.position.clone() : new THREE.Vector3(0.38, 1, -0.5);
    const inv = new THREE.Matrix4().copy(view.root.matrixWorld).invert();
    const eye = eyeL.clone().applyMatrix4(view.root.matrixWorld), c = mesh.getWorldPosition(new THREE.Vector3());
    const dir = c.clone().sub(eye), dist = dir.length(); dir.normalize();
    const hits = new THREE.Raycaster(eye, dir, 0, dist + 0.01).intersectObject(view.root, true).filter((h) => h.object !== mesh && !h.object.isSkinnedMesh && dist - h.distance < 0.08 && dist - h.distance > 0);
    if (!hits.length) return;
    const push = dist - hits[0].distance + 0.004;
    const local = dir.clone().negate().transformDirection(inv);
    mesh.position.addScaledVector(local, push);
    mesh.updateMatrixWorld(true);
  }

  fixUv(mesh, placeholder) {
    if (!placeholder || mesh.userData.uvFixed) return;
    const u = mesh.geometry.attributes.uv;
    for (let i = 0; i < u.count; i++) u.setY(i, 1 - u.getY(i));
    u.needsUpdate = true; mesh.userData.uvFixed = true;
  }

  gaze(camera) {
    if (!this.screen) return null;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = this.raycaster.intersectObject(this.screen, false);
    if (!hits.length || !hits[0].uv || hits[0].distance > 1.4) { this.hit = null; return null; }
    const u = hits[0].uv;
    this.hit = { x: u.x * W, y: u.y * H, point: hits[0].point.clone() };
    return this.hit;
  }

  tap() {
    if (!this.hit) return false;
    const b = this.find(this.hit.x, this.hit.y);
    this.g.audio.play('ui_tap', { inside: true, gain: 0.8 });
    if (b) { this.press = b.id; this.pressT = 0.18; b.fn(); this.dirty = true; }
    return true;
  }

  find(x, y) { for (let i = this.buttons.length - 1; i >= 0; i--) { const b = this.buttons[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b; } return null; }

  btn(id, x, y, w, h, fn) { this.buttons.push({ id, x, y, w, h, fn }); return this.hover === id || this.press === id; }

  update(dt, fpp) {
    const tc = this.g.tc;
    this.pressT -= dt; if (this.pressT <= 0) this.press = null;
    const hov = this.hit ? (this.find(this.hit.x, this.hit.y) || {}).id || null : null;
    if (hov !== this.hover) { this.hover = hov; this.dirty = true; }
    const animating = this.updateRoll(dt);
    const live = animating || this.app === 'map' || tc.armed || tc.busy;
    this.timer -= dt; this.clTimer -= dt;
    const hk = this.hit ? Math.round(this.hit.x / 5) * 10000 + Math.round(this.hit.y / 5) : -1;
    if (hk !== this.lastHk) { this.lastHk = hk; this.dirty = true; }
    if (this.timer <= 0 && (this.dirty || live || this.timer < -1)) { this.draw(); this.dirty = false; this.timer = fpp ? (live || this.hit ? 1 / 30 : 1 / 8) : 0.5; }
    if (this.clTimer <= 0) { this.drawCluster(); this.clTimer = fpp ? 1 / 20 : 1 / 4; }
    this.bright.value = 1.3 + 4.2 * (1 - this.g.sky.state.night);
  }

  rollText(key, text) {
    let r = this.roll.get(key);
    if (!r) { r = { cur: text, prev: text, t: 1 }; this.roll.set(key, r); }
    if (r.cur !== text) { r.prev = r.cur; r.cur = text; r.t = 0; }
    return r;
  }

  updateRoll(dt) { let a = false; for (const r of this.roll.values()) if (r.t < 1) { r.t = Math.min(1, r.t + dt / 0.35); a = true; } return a; }

  drawRolling(g, key, text, x, y, size, color, align = 'left') {
    const r = this.rollText(key, text);
    g.font = `300 ${size}px ${FONT}`; g.fillStyle = color; g.textBaseline = 'alphabetic';
    const w = g.measureText(r.cur).width;
    let x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    const e = r.t < 1 ? 1 - Math.pow(1 - r.t, 3) : 1;
    const n = Math.max(r.cur.length, r.prev.length);
    const pc = r.prev.padStart(n, ' '), cc = r.cur.padStart(n, ' ');
    g.save(); g.beginPath(); g.rect(x0 - 8, y - size, w + 30, size * 1.25); g.clip();
    let cx = x0 - (g.measureText(cc).width - w);
    for (let i = 0; i < n; i++) {
      const ch = cc[i], ph = pc[i], cw = g.measureText(ch).width;
      if (ch !== ph && e < 1) { g.globalAlpha = 1 - e; g.fillText(ph, cx, y - e * size * 0.9); g.globalAlpha = e; g.fillText(ch, cx, y + (1 - e) * size * 0.9); g.globalAlpha = 1; }
      else g.fillText(ch, cx, y);
      cx += cw;
    }
    g.restore();
  }

  draw() {
    const g = this.ctx;
    this.buttons = [];
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    const tc = this.g.tc, p = tc.present;
    g.font = `500 22px ${FONT}`; g.fillStyle = C.dim; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText(`${pad2(p.hour)}:${pad2(p.minute)}`, 32, 34);
    g.textAlign = 'right';
    g.fillText(`${eraOf(p.year).label} · ${formatYear(p.year)}`, W - 32, 34);
    g.textAlign = 'left';
    if (this.app === 'tc') this.drawTC(g); else if (this.app === 'map') this.drawMap(g); else if (this.app === 'car') this.drawCar(g); else this.drawRadio(g);
    const apps = [['tc', 'Time Circuits'], ['map', 'Map'], ['car', 'Car'], ['radio', 'Radio']];
    g.fillStyle = '#08090b'; g.fillRect(0, H - 96, W, 96);
    g.fillStyle = C.line; g.fillRect(0, H - 96, W, 1);
    apps.forEach(([id, label], i) => {
      const bw = 230, x = W / 2 - (apps.length * bw) / 2 + i * bw, y = H - 82;
      const hot = this.btn('app_' + id, x + 10, y, bw - 20, 68, () => { this.app = id; this.keypad = null; this.g.audio.play('ui_toggle', { inside: true, gain: 0.6 }); });
      if (this.app === id) { g.fillStyle = 'rgba(255,255,255,0.1)'; rr(g, x + 10, y, bw - 20, 68, 16); g.fill(); }
      else if (hot) { g.fillStyle = 'rgba(255,255,255,0.05)'; rr(g, x + 10, y, bw - 20, 68, 16); g.fill(); }
      this.icon(g, id, x + bw / 2, y + 26, this.app === id ? C.ink : C.dim);
      g.font = `500 17px ${FONT}`; g.fillStyle = this.app === id ? C.ink : C.dim; g.textAlign = 'center'; g.fillText(label, x + bw / 2, y + 54); g.textAlign = 'left';
    });
    if (this.hit) {
      const hot = !!this.hover;
      g.beginPath(); g.arc(this.hit.x, this.hit.y, hot ? 22 : 16, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = hot ? C.blue : 'rgba(255,255,255,0.85)'; g.stroke();
      g.beginPath(); g.arc(this.hit.x, this.hit.y, 5, 0, Math.PI * 2); g.fillStyle = hot ? C.blue : '#fff'; g.fill();
    }
    this.tex.needsUpdate = true;
  }

  icon(g, id, x, y, col) {
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.4;
    g.beginPath();
    if (id === 'tc') { g.arc(x, y, 12, 0, Math.PI * 2); g.moveTo(x, y); g.lineTo(x, y - 8); g.moveTo(x, y); g.lineTo(x + 6, y + 3); }
    else if (id === 'map') { g.moveTo(x - 13, y - 9); g.lineTo(x - 4, y - 12); g.lineTo(x + 4, y - 9); g.lineTo(x + 13, y - 12); g.lineTo(x + 13, y + 9); g.lineTo(x + 4, y + 12); g.lineTo(x - 4, y + 9); g.lineTo(x - 13, y + 12); g.closePath(); }
    else if (id === 'car') { rr(g, x - 15, y - 3, 30, 10, 4); g.moveTo(x - 9, y - 3); g.lineTo(x - 5, y - 10); g.lineTo(x + 6, y - 10); g.lineTo(x + 10, y - 3); }
    else { g.arc(x, y + 2, 9, Math.PI, 0); g.moveTo(x - 13, y + 2); g.lineTo(x - 13, y + 10); g.moveTo(x + 13, y + 2); g.lineTo(x + 13, y + 10); }
    g.stroke();
  }

  drawTC(g) {
    const tc = this.g.tc;
    const rows = [['DESTINATION TIME', tc.destination, C.red, 'd'], ['PRESENT TIME', tc.present, C.green, 'p'], ['LAST TIME DEPARTED', tc.last, C.amber, 'l']];
    const x0 = 40, colX = [x0, x0 + 150, x0 + 260, x0 + 600, x0 + 760];
    rows.forEach(([label, d, accent, k], i) => {
      const y = 80 + i * 132;
      g.fillStyle = C.panel; rr(g, 24, y, 830, 118, 18); g.fill();
      g.fillStyle = accent; g.fillRect(24, y + 20, 3, 78);
      g.font = `600 14px ${FONT}`; g.fillStyle = accent; g.textBaseline = 'alphabetic';
      g.fillText(label, x0 + 6, y + 30);
      g.font = `500 12px ${FONT}`; g.fillStyle = C.faint;
      ['MONTH', 'DAY', 'YEAR', 'HOUR', 'MIN'].forEach((t, j) => g.fillText(t, colX[j] + 6, y + 52));
      if (d) {
        this.drawRolling(g, k + 'm', monthName(d.month), colX[0] + 6, y + 100, 44, C.ink);
        this.drawRolling(g, k + 'd', pad2(d.day), colX[1] + 6, y + 100, 44, C.ink);
        this.drawRolling(g, k + 'y', formatYear(d.year), colX[2] + 6, y + 100, d.year < -999999 ? 34 : 44, C.ink);
        this.drawRolling(g, k + 'h', pad2(d.hour), colX[3] + 6, y + 100, 44, C.ink);
        this.drawRolling(g, k + 'n', pad2(d.minute), colX[4] + 6, y + 100, 44, C.ink);
        g.font = `300 44px ${FONT}`; g.fillStyle = C.dim; g.fillText(':', colX[4] - 26, y + 98);
      } else { g.font = `300 44px ${FONT}`; g.fillStyle = C.faint; g.fillText('--- -- ---- --:--', colX[0] + 6, y + 100); }
    });
    const armed = tc.armed, busy = tc.busy;
    const ax = 880, aw = 376;
    const hot = this.btn('arm', ax, 80, aw, 118, () => this.g.toggleArm());
    g.fillStyle = armed ? 'rgba(255,182,72,0.16)' : hot ? 'rgba(255,255,255,0.08)' : C.panel; rr(g, ax, 80, aw, 118, 18); g.fill();
    if (armed) { g.strokeStyle = C.amber; g.lineWidth = 2; rr(g, ax + 1, 81, aw - 2, 116, 17); g.stroke(); }
    g.font = `600 28px ${FONT}`; g.fillStyle = armed ? C.amber : C.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(busy ? 'IN TRANSIT' : armed ? 'ARMED' : 'ARM', ax + aw / 2, 128);
    g.font = `500 14px ${FONT}`; g.fillStyle = C.dim;
    g.fillText(armed ? `${Math.round(this.g.car.sim.speed / 0.44704)} / 88 mph` : 'Time circuits off', ax + aw / 2, 164);
    if (armed) { g.fillStyle = 'rgba(255,182,72,0.25)'; g.fillRect(ax + 30, 182, aw - 60, 3); g.fillStyle = C.amber; g.fillRect(ax + 30, 182, (aw - 60) * Math.min(1, this.g.car.sim.speed / 0.44704 / 88), 3); }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    if (this.keypad) { this.drawKeypad(g, ax, 212, aw); return; }
    g.font = `600 13px ${FONT}`; g.fillStyle = C.faint; g.fillText('DESTINATIONS', ax + 6, 232);
    ERAS.forEach((e, i) => {
      const bx = ax + (i % 2) * (aw / 2 + 4), by = 246 + Math.floor(i / 2) * 64, bw = aw / 2 - 4, bh = 56;
      const sel = tc.destination.year === e.date.year;
      const h2 = this.btn('era_' + e.id, bx, by, bw, bh, () => { if (!this.g.tc.busy) { this.g.tc.setDestination(e.date); this.g.store.set('destEra', i); } });
      g.fillStyle = sel ? 'rgba(255,90,78,0.14)' : h2 ? 'rgba(255,255,255,0.08)' : C.panel; rr(g, bx, by, bw, bh, 14); g.fill();
      if (sel) { g.strokeStyle = 'rgba(255,90,78,0.7)'; g.lineWidth = 1.5; rr(g, bx + 0.75, by + 0.75, bw - 1.5, bh - 1.5, 13); g.stroke(); }
      g.font = `500 17px ${FONT}`; g.fillStyle = C.ink; g.fillText(e.label, bx + 16, by + 25);
      g.font = `400 13px ${FONT}`; g.fillStyle = C.dim; g.fillText(formatYear(e.date.year), bx + 16, by + 44);
    });
    const ky = 246 + 4 * 64;
    const h3 = this.btn('keypad', ax + aw / 2 + 4, ky - 64, aw / 2 - 4, 56, () => { this.keypad = { field: 0, d: cloneDate(this.g.tc.destination), buf: '' }; });
    g.fillStyle = h3 ? 'rgba(255,255,255,0.08)' : C.panel; rr(g, ax + aw / 2 + 4, ky - 64, aw / 2 - 4, 56, 14); g.fill();
    g.font = `500 17px ${FONT}`; g.fillStyle = C.ink; g.fillText('Enter date…', ax + aw / 2 + 20, ky - 30);
  }

  drawKeypad(g, ax, ay, aw) {
    const K = this.keypad, d = K.d;
    const fields = [['MONTH', 'month'], ['DAY', 'day'], ['YEAR', 'year'], ['HOUR', 'hour'], ['MIN', 'minute']];
    g.fillStyle = C.panel; rr(g, ax, ay, aw, 488, 18); g.fill();
    fields.forEach(([label, key], i) => {
      const fx = ax + 14 + (i < 3 ? i * 118 : (i - 3) * 118), fy = ay + 14 + (i < 3 ? 0 : 66), fw = i === 2 ? 110 : 110;
      const sel = K.field === i;
      this.btn('kf' + i, fx, fy, fw, 58, () => { K.field = i; K.buf = ''; });
      g.fillStyle = sel ? 'rgba(255,90,78,0.16)' : 'rgba(255,255,255,0.04)'; rr(g, fx, fy, fw, 58, 10); g.fill();
      g.font = `500 11px ${FONT}`; g.fillStyle = C.faint; g.fillText(label, fx + 10, fy + 18);
      const val = sel && K.buf ? K.buf : key === 'month' ? monthName(d.month) : key === 'year' ? (Math.abs(d.year) > 99999 ? (Math.abs(d.year) / 1e6).toFixed(Math.abs(d.year) % 1e6 ? 1 : 0) + 'M' : String(Math.abs(d.year))) : pad2(d[key]);
      g.font = `300 26px ${FONT}`; g.fillStyle = C.ink; g.fillText(val, fx + 10, fy + 47);
    });
    const bc = d.year < 0;
    this.btn('bc', ax + 14 + 2 * 118, ay + 80, 110, 44, () => { K.d.year = -K.d.year; });
    g.fillStyle = bc ? 'rgba(255,90,78,0.2)' : 'rgba(255,255,255,0.04)'; rr(g, ax + 14 + 2 * 118, ay + 80, 110, 44, 10); g.fill();
    g.font = `600 16px ${FONT}`; g.fillStyle = bc ? C.red : C.dim; g.textAlign = 'center'; g.fillText(bc ? 'BC' : 'AD', ax + 14 + 2 * 118 + 55, ay + 108); g.textAlign = 'left';
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'];
    keys.forEach((k, i) => {
      const bx = ax + 14 + (i % 3) * 118, by = ay + 146 + Math.floor(i / 3) * 82, bw = 110, bh = 74;
      const hot = this.btn('k' + k, bx, by, bw, bh, () => this.keyInput(k));
      g.fillStyle = hot ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'; rr(g, bx, by, bw, bh, 14); g.fill();
      g.font = `${k === 'OK' ? 600 : 300} ${k.length > 1 ? 22 : 30}px ${FONT}`; g.fillStyle = k === 'OK' ? C.red : C.ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(k, bx + bw / 2, by + bh / 2); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    });
  }

  keyInput(k) {
    const K = this.keypad;
    if (k === 'C') { K.buf = ''; return; }
    if (k === 'OK') {
      this.commitField();
      if (!this.g.tc.busy) this.g.tc.setDestination(clampDate(K.d));
      this.keypad = null; this.g.audio.play('ui_toggle', { inside: true }); return;
    }
    const max = K.field === 2 ? 10 : 2;
    if (K.buf.length < max) K.buf += k;
    if (K.field !== 2 && K.buf.length === 2) { this.commitField(); K.field = Math.min(4, K.field + 1); }
  }

  commitField() {
    const K = this.keypad; if (!K.buf) return;
    const v = parseInt(K.buf, 10), keys = ['month', 'day', 'year', 'hour', 'minute'], key = keys[K.field];
    if (key === 'year') K.d.year = (K.d.year < 0 ? -1 : 1) * Math.max(1, v);
    else K.d[key] = v;
    clampDate(K.d); K.buf = '';
  }

  drawMap(g) {
    const L = this.g.layout, P = L.plate;
    const mx = 40, my = 70, mw = W - 80, mh = H - 96 - 90;
    g.fillStyle = '#101215'; rr(g, mx, my, mw, mh, 18); g.fill();
    const sx = mh / (P.z1 - P.z0), cx = mx + mw / 2, cy = my + mh / 2;
    const map = (x, z) => [cx - x * sx, cy - z * sx];
    g.save(); rr(g, mx, my, mw, mh, 18); g.clip();
    const [px0, py0] = map(P.x1, P.z1), [px1, py1] = map(P.x0, P.z0);
    g.fillStyle = '#1d2024'; g.fillRect(px0, py0, px1 - px0, py1 - py0);
    for (const z of L.zones) { const [a, b] = map(z.rect[2], z.rect[3]), [c2, d2] = map(z.rect[0], z.rect[1]); g.fillStyle = `rgba(${z.color.map((v) => Math.round(v * 255)).join(',')},${Math.min(0.45, z.a * 2.2)})`; g.fillRect(a, b, c2 - a, d2 - b); }
    for (const rv of L.ravines) { const [a, b] = map(rv.rect[2], rv.rect[3]), [c2, d2] = map(rv.rect[0], rv.rect[1]); g.fillStyle = '#050607'; g.fillRect(a, b, c2 - a, d2 - b); }
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (const s of L.statics) { if (s.kind === 'box' || s.kind === 'cyl') { const [a, b] = map(s.pos[0], s.pos[2]); const r = Math.max(2, (s.kind === 'box' ? Math.max(s.half[0], s.half[2]) : s.r) * sx); g.fillRect(a - r, b - r, r * 2, r * 2); } }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (const p of L.props) { const [a, b] = map(p.pos[0], p.pos[2]); g.fillRect(a - 1, b - 1, 2, 2); }
    for (const c of this.g.wrecks) { const [a, b] = map(c.sim.pos.x, c.sim.pos.z); g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.arc(a, b, 4, 0, Math.PI * 2); g.fill(); }
    const s = this.g.car.sim, [ax, ay] = map(s.pos.x, s.pos.z), yaw = s.yaw();
    g.save(); g.translate(ax, ay); g.rotate(-yaw + Math.PI);
    g.fillStyle = C.blue; g.beginPath(); g.moveTo(0, -14); g.lineTo(9, 10); g.lineTo(0, 5); g.lineTo(-9, 10); g.closePath(); g.fill();
    g.restore();
    g.restore();
    g.font = `500 15px ${FONT}`; g.fillStyle = C.dim; g.fillText('Test plate · 1.4 × 2.3 km', mx + 18, my + 30);
    g.fillText(`${Math.round(s.pos.x)} , ${Math.round(s.pos.z)}`, mx + 18, my + 54);
  }

  drawCar(g) {
    const st = this.g.settings;
    const toggles = [['Flight assist', st.assist, () => this.g.setAssist(!this.g.settings.assist)], ['Targa roof', st.roof, () => this.g.setRoof(!this.g.settings.roof)], ['Rear wing', st.wing, () => this.g.setWing(!this.g.settings.wing)]];
    toggles.forEach(([label, on, fn], i) => {
      const x = 40, y = 80 + i * 92, w = 560, h = 78;
      const hot = this.btn('t' + i, x, y, w, h, () => { fn(); this.g.audio.play('ui_toggle', { inside: true }); });
      g.fillStyle = hot ? '#1c1f24' : C.panel; rr(g, x, y, w, h, 16); g.fill();
      g.font = `500 22px ${FONT}`; g.fillStyle = C.ink; g.textBaseline = 'middle'; g.fillText(label, x + 24, y + h / 2);
      g.fillStyle = on ? C.blue : 'rgba(255,255,255,0.16)'; rr(g, x + w - 96, y + h / 2 - 17, 72, 34, 17); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(on ? x + w - 41 : x + w - 79, y + h / 2, 14, 0, Math.PI * 2); g.fill();
    });
    g.textBaseline = 'alphabetic';
    const repair = this.btn('repair', 40, 380, 560, 78, () => this.g.respawn());
    g.fillStyle = repair ? '#1c1f24' : C.panel; rr(g, 40, 380, 560, 78, 16); g.fill();
    g.font = `500 22px ${FONT}`; g.fillStyle = C.ink; g.fillText('New Roadster', 64, 427); g.font = `400 15px ${FONT}`; g.fillStyle = C.dim; g.fillText('Same as R · the wreck stays', 250, 427);
    g.font = `600 13px ${FONT}`; g.fillStyle = C.faint; g.fillText('PAINT', 660, 104);
    Object.entries(PAINTS).forEach(([k, p], i) => {
      const x = 660 + i * 112, y = 120;
      const hot = this.btn('paint_' + k, x, y, 96, 132, () => this.g.setPaint(k));
      const col = `rgb(${p.a.map((v) => Math.round(Math.pow(Math.min(1, v * 1.6), 1 / 2.2) * 255)).join(',')})`;
      g.fillStyle = hot ? '#1c1f24' : C.panel; rr(g, x, y, 96, 132, 16); g.fill();
      g.fillStyle = col; g.beginPath(); g.arc(x + 48, y + 52, 30, 0, Math.PI * 2); g.fill();
      if (this.g.settings.paint === k) { g.strokeStyle = C.ink; g.lineWidth = 2.5; g.beginPath(); g.arc(x + 48, y + 52, 36, 0, Math.PI * 2); g.stroke(); }
      g.font = `500 12px ${FONT}`; g.fillStyle = C.dim; g.textAlign = 'center'; g.fillText(p.label.split(' ')[0], x + 48, y + 112); g.textAlign = 'left';
    });
    g.font = `600 13px ${FONT}`; g.fillStyle = C.faint; g.fillText('OUTFIT', 660, 300);
    const outfits = this.g.driver ? this.g.driver.outfits : [];
    outfits.forEach((o, i) => {
      const x = 660 + (i % 2) * 290, y = 316 + Math.floor(i / 2) * 70;
      const hot = this.btn('outfit_' + i, x, y, 278, 60, () => this.g.setOutfit(i));
      const sel = this.g.driver && this.g.driver.outfitIndex === i;
      g.fillStyle = sel ? 'rgba(62,139,255,0.18)' : hot ? '#1c1f24' : C.panel; rr(g, x, y, 278, 60, 14); g.fill();
      g.font = `500 17px ${FONT}`; g.fillStyle = C.ink; g.fillText(o.label, x + 18, y + 37);
    });
  }

  drawRadio(g) {
    const era = eraOf(this.g.tc.present.year).id, on = this.g.settings.radio;
    g.fillStyle = C.panel; rr(g, 40, 80, 560, 380, 20); g.fill();
    g.font = `600 13px ${FONT}`; g.fillStyle = C.faint; g.fillText('NOW PLAYING', 70, 120);
    const e = ERAS.find((x) => x.id === era);
    g.font = `300 52px ${FONT}`; g.fillStyle = C.ink; g.fillText(`${e.label} FM`, 70, 196);
    g.font = `400 18px ${FONT}`; g.fillStyle = C.dim; g.fillText(`Follows the present era · ${formatYear(this.g.tc.present.year)}`, 70, 232);
    const hot = this.btn('radio', 70, 300, 200, 70, () => this.g.setRadio(!this.g.settings.radio));
    g.fillStyle = on ? C.blue : hot ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)'; rr(g, 70, 300, 200, 70, 35); g.fill();
    g.font = `600 22px ${FONT}`; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(on ? 'On' : 'Off', 170, 335); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    for (let i = 0; i < 2; i++) {
      const hb = this.btn('vol' + i, 300 + i * 90, 300, 76, 70, () => { const a = this.g.audio; a.radioVol = Math.max(0.1, Math.min(1, a.radioVol + (i ? 0.15 : -0.15))); a.setRadio(this.g.settings.radio, era); });
      g.fillStyle = hb ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)'; rr(g, 300 + i * 90, 300, 76, 70, 35); g.fill();
      g.font = `300 34px ${FONT}`; g.fillStyle = C.ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(i ? '+' : '−', 338 + i * 90, 333); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    }
    g.font = `600 13px ${FONT}`; g.fillStyle = C.faint; g.fillText('STATIONS', 660, 104);
    ERAS.forEach((x, i) => {
      const y = 120 + i * 50, cur = x.id === era;
      g.fillStyle = cur ? 'rgba(62,139,255,0.16)' : C.panel; rr(g, 660, y, 580, 42, 12); g.fill();
      g.font = `500 17px ${FONT}`; g.fillStyle = cur ? C.ink : C.dim; g.fillText(`${x.label} FM`, 680, y + 27);
      g.textAlign = 'right'; g.fillText(formatYear(x.date.year), 1224, y + 27); g.textAlign = 'left';
    });
  }

  drawCluster() {
    const g = this.cl.getContext('2d'), s = this.g.car.sim;
    g.fillStyle = '#050607'; g.fillRect(0, 0, 512, 180);
    const mph = Math.round(s.speed / 0.44704);
    g.font = `300 92px ${FONT}`; g.fillStyle = '#f2f3f5'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(String(mph), 256, 112);
    g.font = `500 16px ${FONT}`; g.fillStyle = 'rgba(242,243,245,0.5)'; g.fillText('MPH', 256, 138);
    const gear = s.speed < 0.3 && s.parkedT > 2.5 ? 'P' : s.gear;
    g.font = `600 22px ${FONT}`;
    ['P', 'R', 'N', 'D'].forEach((c, i) => { g.fillStyle = c === gear ? '#f2f3f5' : 'rgba(242,243,245,0.25)'; g.fillText(c, 60 + i * 26, 100); });
    if (this.g.tc.armed) { g.fillStyle = '#ffb648'; g.font = `600 15px ${FONT}`; g.fillText('TIME CIRCUITS', 420, 92); g.fillRect(372, 102, 96 * Math.min(1, mph / 88), 3); }
    if (!this.g.settings.assist) { g.fillStyle = 'rgba(242,243,245,0.6)'; g.font = `600 13px ${FONT}`; g.fillText('ASSIST OFF', 420, 140); }
    g.textAlign = 'left';
    this.clTex.needsUpdate = true;
  }
}
