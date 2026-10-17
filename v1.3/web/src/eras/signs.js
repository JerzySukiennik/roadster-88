// Roadster 88 era signs: a painted sign atlas (frontier boards, restored storefronts, modern and future signage, highway and billboard faces) drawn on a canvas, with uv rects looked up by name.
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
  ['MOTEL', 'm', '#183450', '#ff6b4a'], ['SCHOOL', 'm', '#e8e2d4', '#1f2f45'], ['LIBRARY', 'm', '#e8e2d4', '#2a2a2a'], ['WATER', 'w', '#efe6d2', '#2a1d14'],
];

const COLS = 2, ROWS = 16, CW = 1024, CH = 128;

function paint() {
  const cv = document.createElement('canvas'); cv.width = CW * COLS; cv.height = CH * ROWS;
  const g = cv.getContext('2d');
  const fonts = { w: '700 82px Rockwell, "American Typewriter", Georgia, serif', m: '700 78px "Helvetica Neue", Helvetica, Arial, sans-serif', h: '700 64px "Helvetica Neue", Helvetica, Arial, sans-serif', b: '800 70px "Avenir Next", "Helvetica Neue", Arial, sans-serif', f: '300 74px "Avenir Next", "Helvetica Neue", Arial, sans-serif' };
  let s = 7;
  const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  SIGNS.forEach(([text, style, bg, fg], i) => {
    const x0 = (i % COLS) * CW, y0 = Math.floor(i / COLS) * CH;
    g.fillStyle = bg; g.fillRect(x0, y0, CW, CH);
    if (style === 'w') {
      for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(0,0,0,${0.05 + R() * 0.08})`; g.fillRect(x0, y0 + k * CH / 6, CW, 2); }
      g.strokeStyle = fg; g.globalAlpha = 0.6; g.lineWidth = 5; g.strokeRect(x0 + 12, y0 + 10, CW - 24, CH - 20); g.globalAlpha = 1;
    }
    if (style === 'h') { g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(x0 + 8, y0 + 8, CW - 16, CH - 16); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = fonts[style]; g.font = fs;
    const m = g.measureText(text).width;
    const scale = Math.min(1, (CW - 90) / m);
    g.save(); g.translate(x0 + CW / 2, y0 + CH / 2 + 4); g.scale(scale, 1);
    if (style === 'w') g.fillText(text.split('').join(String.fromCharCode(8202)), 0, 0); else g.fillText(text, 0, 0);
    g.restore();
    if (style === 'w') for (let k = 0; k < 140; k++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,250,235' : '20,12,6'},${R() * 0.12})`; g.fillRect(x0 + R() * CW, y0 + R() * CH, 2 + R() * 30, 1 + R() * 3); }
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export class SignAtlas {
  constructor(lib) {
    this.tex = paint();
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0 });
    const t = texture(this.tex, uv());
    const n = mx_noise_float(positionWorld.mul(1.7)).mul(0.5).add(0.5);
    m.colorNode = t.rgb.mul(float(0.85).add(n.mul(0.2))).mul(mix(float(1), float(0.75), lib.U.grime));
    m.emissiveNode = t.rgb.mul(lib.U.night).mul(lib.U.lights).mul(attribute('aux', 'vec4').x);
    m.name = 'era_sign';
    this.mat = m;
  }
  rect(name) {
    const i = SIGNS.findIndex((s) => s[0] === name);
    const k = i < 0 ? 0 : i;
    const u0 = (k % COLS) / COLS, v1 = 1 - Math.floor(k / COLS) / ROWS;
    return [u0, v1 - 1 / ROWS, u0 + 1 / COLS, v1];
  }
}
