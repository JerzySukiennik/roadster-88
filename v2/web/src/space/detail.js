// Roadster 88 nadir detail: streams NASA GIBS tiles (Blue Marble Next Generation by day and VIIRS Black Marble by night, 500 m per pixel) into a patch of 4 x 4 tiles ahead of the ground track, double-buffered, so the ground under the car is ten times sharper than the global map. Falls back silently to the global map when offline.
import * as THREE from 'three/webgpu';

const BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/';
const LAYERS = { day: { path: 'BlueMarble_NextGeneration/default/2004-08-01/500m/', ext: 'jpeg' }, night: { path: 'VIIRS_Black_Marble/default/2016-01-01/500m/', ext: 'png' } };
const LEVEL = 7, SPAN = 2.25, PX = 512;

export class DetailPatch {
  constructor(space, n = 4) {
    this.S = space; this.n = n;
    this.cache = new Map(); this.order = [];
    this.key = null; this.busy = false; this.failed = 0;
    this.on = 0;
  }

  url(layer, row, col) { const L = LAYERS[layer]; return `${BASE}${L.path}${LEVEL}/${row}/${col}.${L.ext}`; }

  async tile(layer, row, col) {
    const k = layer + row + '_' + col;
    if (this.cache.has(k)) return this.cache.get(k);
    const p = (async () => {
      const r = await fetch(this.url(layer, row, col), { mode: 'cors' });
      if (!r.ok) throw new Error('tile ' + r.status);
      return createImageBitmap(await r.blob());
    })();
    this.cache.set(k, p); this.order.push(k);
    while (this.order.length > 96) { const old = this.order.shift(); const v = this.cache.get(old); this.cache.delete(old); if (v) v.then((b) => b.close && b.close(), () => {}); }
    p.catch(() => { this.cache.delete(k); });
    return p;
  }

  async build(row0, col0) {
    const n = this.n, size = n * PX;
    const out = {};
    for (const layer of ['day', 'night']) {
      const c = new OffscreenCanvas(size, size), g = c.getContext('2d');
      g.fillStyle = layer === 'day' ? '#0b1a33' : '#000'; g.fillRect(0, 0, size, size);
      const jobs = [];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const row = row0 + i, col = ((col0 + j) % 160 + 160) % 160;
        if (row < 0 || row >= 80) continue;
        jobs.push(this.tile(layer, row, col).then((b) => g.drawImage(b, j * PX, i * PX)).catch(() => { this.failed++; }));
      }
      await Promise.all(jobs);
      const t = new THREE.Texture(c.transferToImageBitmap());
      t.flipY = false; t.colorSpace = layer === 'day' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
      out[layer] = t;
    }
    return out;
  }

  update(lat, lon, alt) {
    const S = this.S, U = S.U;
    const want = alt < 3.2e6 && S.look && S.look.mode === 0 && S.look.earth;
    this.on += ((want && this.ready ? 1 : 0) - this.on) * 0.08;
    U.patch.value.w = this.on;
    if (!want || this.busy || this.failed > 40) return;
    const row = Math.floor((90 - lat) / SPAN), col = Math.floor((lon + 180) / SPAN);
    const half = Math.floor(this.n / 2);
    const row0 = row - half + (((90 - lat) / SPAN) % 1 > 0.5 ? 1 : 0), col0 = col - half + (((lon + 180) / SPAN) % 1 > 0.5 ? 1 : 0);
    const key = row0 + '_' + col0;
    if (key === this.key) return;
    if (this.key && this.center && Math.abs(this.center[0] - row) < half - 0.6 && Math.abs(this.center[1] - col) < half - 0.6 && this.cur) return;
    this.busy = true;
    this.build(row0, col0).then((t) => {
      const old = this.cur;
      this.cur = t; this.key = key; this.center = [row0 + half, col0 + half]; this.ready = true;
      S.T.patchDay.value = t.day; S.T.patchNight.value = t.night;
      U.patch.value.x = -180 + col0 * SPAN; U.patch.value.y = 90 - row0 * SPAN; U.patch.value.z = this.n * SPAN;
      if (old) setTimeout(() => { old.day.dispose(); old.night.dispose(); }, 1000);
    }).catch((e) => { this.failed += 4; console.warn('detail patch', e && e.message); }).finally(() => { this.busy = false; });
  }
}
