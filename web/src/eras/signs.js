// Roadster 88 era signs: a painted sign atlas (frontier boards, Gold Rush and mission-era lettering, art deco and neon, modern, highway, billboard and future signage, with storefronts and gas prices for every decade) drawn on a canvas, with uv rects looked up by name; unknown names are added on the fly into free slots.
import * as THREE from 'three/webgpu';
import { texture, uv, float, mx_noise_float, positionWorld, mix, attribute } from 'three/tsl';

export const SIGNS = [
  ['SALOON', 'w', '#5a1a12', '#e9dcc0'], ['GENERAL STORE', 'w', '#24331f', '#efe3c4'], ['HOTEL', 'w', '#efe6d2', '#2a1d14'], ['BANK', 'w', '#1d1d24', '#d9c27a'],
  ['SHERIFF', 'w', '#3b2a1a', '#e8d9b5'], ['BARBER', 'w', '#efe6d2', '#7a1f18'], ['ASSAY OFFICE', 'w', '#2c2a26', '#e5d6b0'], ['LIVERY', 'w', '#6b2516', '#f0e2c6'],
  ['BLACKSMITH', 'w', '#232323', '#e4d3ae'], ['GZOWO SPRINGS', 'w', '#efe6d2', '#1f2a40'], ['POST OFFICE', 'w', '#2a3550', '#efe4c8'], ['DRY GOODS', 'w', '#4a3b22', '#f0e3c2'],
  ['CAFE', 'm', '#1c3a34', '#f3efe6'], ['ANTIQUES', 'm', '#6b2b1e', '#f6efe2'], ['BREWING CO', 'm', '#141414', '#e8c06a'], ['HISTORIC DEPOT MUSEUM', 'm', '#2b2b2b', '#efe8d8'],
  ['88 MART', 'm', '#c42b1c', '#ffffff'], ['GZOWO FUEL', 'm', '#0f3a6e', '#ffffff'], ['DINER', 'm', '#b8231a', '#fff3d6'], ['HARDWARE', 'm', '#2c4f7a', '#ffffff'],
  ['GZOWO SPRINGS  EXIT 88', 'h', '#0d5b34', '#ffffff'], ['MAIN ST  NEXT RIGHT', 'h', '#0d5b34', '#ffffff'], ['VISIT GZOWO SPRINGS', 'b', '#e9e2d0', '#1d2b3a'], ['ROADSTER 88  0-60 IN 1.1 S', 'b', '#111111', '#f2f2f2'],
  ['GZOWO TRANSIT', 'f', '#0e1013', '#9fd7ff'], ['CHARGE  2 MIN', 'f', '#0e1013', '#b6ffcf'], ['VERTICAL FARM', 'f', '#f1f3f2', '#2c6a4a'], ['GZOWO SPRINGS 2080', 'f', '#f4f6f7', '#1b2a36'],
  ['MOTEL', 'n', '#0e1a26', '#ff6b4a'], ['SCHOOL', 'm', '#e8e2d4', '#1f2f45'], ['LIBRARY', 'm', '#e8e2d4', '#2a2a2a'], ['WATER', 'w', '#efe6d2', '#2a1d14'],
  ['MAIN ST  NEXT LEFT', 'h', '#0d5b34', '#ffffff'], ['MINERS SUPPLY', 'w', '#3a2a18', '#efdcb2'], ['GOLD BOUGHT HERE', 'w', '#2b2112', '#e8c45a'], ['CLAIM OFFICE', 'w', '#332a20', '#e6d6b2'],
  ['BATHS  25 CENTS', 'w', '#efe6d2', '#3a2416'], ['STAGE LINE', 'w', '#5b2414', '#f0e0c0'], ['LAND OFFICE', 'w', '#2a2f22', '#ece0c0'], ['TELEPHONE CO', 'd', '#1c2430', '#e9d8a8'],
  ['GARAGE', 'd', '#222222', '#f0d070'], ['DRUG STORE', 'd', '#24402c', '#f2ead0'], ['FEED AND SEED', 'w', '#4d3a1c', '#f0e2be'], ['ICE CREAM', 'd', '#f2e8d8', '#9a2f3a'],
  ['CITRUS PACKING CO', 'd', '#e78a1e', '#1d2a1a'], ['PICTURE SHOW', 'd', '#2a0f12', '#ffd76a'], ['SODA FOUNTAIN', 'd', '#f1e9d6', '#1e5a5a'], ['FIVE AND DIME', 'd', '#9a1e1a', '#f6e8c6'],
  ['GAS 21 CENTS', 'd', '#f0eadb', '#1a3d6a'], ['AUTO REPAIR', 'd', '#1f1f1f', '#e8d090'], ['BAKERY', 'd', '#f3e6cc', '#6a3a1a'], ['RADIO SHOP', 'd', '#1a2230', '#9fd0ff'],
  ['BUS DEPOT', 'd', '#13304d', '#f2f2f2'], ['BUY WAR BONDS', 'b', '#e9e2d0', '#1b3a6b'], ['GAS 19 CENTS', 'd', '#f0eadb', '#7a1a14'], ['LUNCH COUNTER', 'd', '#f2e8d6', '#1e3a2a'],
  ['SHOE REPAIR', 'd', '#2a2420', '#e8d6b0'], ['DRIVE-IN', 'n', '#1a0f24', '#ff4fa0'], ['TV REPAIR', 'n', '#0c1c24', '#5fe0ff'], ['RECORDS', 'n', '#160f1f', '#ffd24a'],
  ['SODA SHOP', 'n', '#1a0e16', '#ff7fb0'], ['GAS 29 CENTS', 'm', '#f2f2ee', '#c4201a'], ['BOWLING', 'n', '#0e1426', '#ff5a3a'], ['VACANCY', 'n', '#0e0e12', '#ff3a3a'],
  ['DRIVE-IN TONIGHT', 'b', '#141018', '#ffcf4a'], ['NEW CARS 1957', 'b', '#f0ece2', '#a81e1a'], ['PIZZA', 'n', '#1a0c0a', '#ff9a3a'], ['DISCO', 'n', '#1a0a24', '#e05aff'],
  ['ARCADE', 'n', '#0a0a1e', '#4affd2'], ['LAUNDROMAT', 'm', '#e6eef2', '#1f4a6a'], ['GAS 55 CENTS', 'm', '#f2f2ee', '#c4201a'], ['CAR WASH', 'm', '#1f5ea8', '#ffffff'],
  ['SURF SHOP', 'm', '#f2c43a', '#1a3a5a'], ['VIDEO RENTAL', 'm', '#1a2a6a', '#ffd23a'], ['PAGERS', 'm', '#141414', '#7aff7a'], ['COFFEE', 'm', '#3a2214', '#f2e6d2'],
  ['GAS 1.19', 'm', '#f2f2ee', '#0f3a6e'], ['MEGA MART', 'm', '#0f3a7a', '#ffffff'], ['INTERNET CAFE', 'm', '#1a1a1a', '#5ad0ff'], ['CELL PHONES', 'm', '#e8f0f8', '#1a3a7a'],
  ['DVD RENTAL', 'm', '#1a2a6a', '#ffd23a'], ['GAS 2.49', 'm', '#f2f2ee', '#0f3a6e'], ['GAS 3.99', 'm', '#f2f2ee', '#0f3a6e'], ['PHONE REPAIR', 'm', '#141414', '#ffffff'],
  ['DRONE DELIVERY', 'f', '#0e1013', '#ffd27a'], ['SOLAR CO-OP', 'f', '#f1f3f2', '#2c6a4a'], ['CHARGE  5 MIN', 'f', '#0e1013', '#b6ffcf'], ['GZOWO SPRINGS 2050', 'f', '#f4f6f7', '#1b2a36'],
  ['SKYPORT', 'f', '#0e1013', '#9fd7ff'], ['GZOWO ARCOLOGY', 'f', '#f4f6f7', '#1b2a36'], ['MAGLEV  4 MIN', 'f', '#0e1013', '#b6ffcf'], ['GZOWO SPRINGS 2150', 'f', '#f4f6f7', '#1b2a36'],
  ['ORBITAL LIFT', 'f', '#0e1013', '#9fd7ff'], ['GZOWO SPRINGS 2300', 'f', '#f4f6f7', '#1b2a36'], ['HERITAGE QUARTER', 'f', '#f1f3f2', '#5a3a2a'], ['MUSEUM OF THE ROAD', 'f', '#f1f3f2', '#1b2a36'],
  ['DRINK COLA', 'b', '#b8231a', '#ffffff'], ['SEE THE VALLEY BY CAR', 'b', '#e9e2d0', '#1d2b3a'], ['MOTEL NEXT EXIT', 'b', '#0d5b34', '#ffffff'], ['ROUTE 88', 'h', '#f2f2f2', '#141414'],
  ['DINER  OPEN 24 HRS', 'n', '#0c0c10', '#ff5050'], ['HOTEL GZOWO', 'd', '#2a0f12', '#ffd76a'], ['THE PALACE', 'd', '#2a0f12', '#ffd76a'], ['CINEMA', 'm', '#141414', '#ff3a3a'],
];

const COLS = 4, ROWS = 32, CW = 512, CH = 64;
const FONTS = { w: '700 41px Rockwell, "American Typewriter", Georgia, serif', m: '700 39px "Helvetica Neue", Helvetica, Arial, sans-serif', h: '700 32px "Helvetica Neue", Helvetica, Arial, sans-serif', b: '800 35px "Avenir Next", "Helvetica Neue", Arial, sans-serif', f: '300 37px "Avenir Next", "Helvetica Neue", Arial, sans-serif', d: '600 38px Futura, "Gill Sans", "Avenir Next", sans-serif', n: '500 40px "Brush Script MT", "Snell Roundhand", "Avenir Next", cursive' };

function paintSign(g, i, [text, style, bg, fg]) {
  let s = 7 + i * 131;
  const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const x0 = (i % COLS) * CW, y0 = Math.floor(i / COLS) * CH;
  g.save(); g.beginPath(); g.rect(x0, y0, CW, CH); g.clip();
  g.fillStyle = bg; g.fillRect(x0, y0, CW, CH);
  if (style === 'w') {
    for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(0,0,0,${0.05 + R() * 0.08})`; g.fillRect(x0, y0 + k * CH / 6, CW, 1); }
    g.strokeStyle = fg; g.globalAlpha = 0.6; g.lineWidth = 3; g.strokeRect(x0 + 6, y0 + 5, CW - 12, CH - 10); g.globalAlpha = 1;
  }
  if (style === 'h') { g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(x0 + 4, y0 + 4, CW - 8, CH - 8); }
  if (style === 'd') { g.strokeStyle = fg; g.globalAlpha = 0.75; g.lineWidth = 2; g.strokeRect(x0 + 5, y0 + 5, CW - 10, CH - 10); g.strokeRect(x0 + 9, y0 + 9, CW - 18, CH - 18); g.globalAlpha = 1; }
  if (style === 'n') { g.shadowColor = fg; g.shadowBlur = 14; }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = FONTS[style] || FONTS.m;
  const m = g.measureText(text).width;
  const scale = Math.min(1, (CW - 46) / m);
  g.save(); g.translate(x0 + CW / 2, y0 + CH / 2 + 2); g.scale(scale, 1);
  if (style === 'w') g.fillText(text.split('').join(String.fromCharCode(8202)), 0, 0); else g.fillText(text, 0, 0);
  if (style === 'n') g.fillText(text, 0, 0);
  g.restore();
  g.shadowBlur = 0;
  if (style === 'w') for (let k = 0; k < 70; k++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,250,235' : '20,12,6'},${R() * 0.12})`; g.fillRect(x0 + R() * CW, y0 + R() * CH, 1 + R() * 15, 1 + R() * 2); }
  g.restore();
}

export class SignAtlas {
  constructor(lib) {
    const cv = document.createElement('canvas'); cv.width = CW * COLS; cv.height = CH * ROWS;
    this.cv = cv; this.g = cv.getContext('2d');
    this.names = new Map();
    SIGNS.forEach((s, i) => { paintSign(this.g, i, s); this.names.set(s[0], i); });
    this.next = SIGNS.length;
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex = t;
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0 });
    const tx = texture(this.tex, uv());
    const n = mx_noise_float(positionWorld.mul(1.7)).mul(0.5).add(0.5);
    m.colorNode = tx.rgb.mul(float(0.85).add(n.mul(0.2))).mul(mix(float(1), float(0.75), lib.U.grime));
    m.emissiveNode = tx.rgb.mul(lib.U.night).mul(lib.U.lights).mul(attribute('aux', 'vec4').x);
    m.name = 'era_sign';
    this.mat = m;
  }

  rect(name) {
    let k = this.names.get(name);
    if (k === undefined) {
      if (this.next >= COLS * ROWS) k = 0;
      else { k = this.next++; paintSign(this.g, k, [name, /\$|GAS/.test(name) ? 'm' : 'b', '#f0ece2', '#1d2b3a']); this.names.set(name, k); this.tex.needsUpdate = true; }
    }
    const u0 = (k % COLS) / COLS, v1 = 1 - Math.floor(k / COLS) / ROWS;
    return [u0, v1 - 1 / ROWS, u0 + 1 / COLS, v1];
  }
}
