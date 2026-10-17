// Roadster 88 HUD: rolling odometer-style speed digits, ten nozzle dots laid out like the car seen from above, thin amber time-circuit arc with destination year, fade-out after quiet periods.
const DIGIT_H = 58;
const LAYOUT = { Nozzle_FL: [-12, 4], Nozzle_FR: [12, 4], Nozzle_SL1: [-21, 20], Nozzle_SL2: [-21, 42], Nozzle_SR1: [21, 20], Nozzle_SR2: [21, 42], Nozzle_RL1: [-17, 59], Nozzle_RL2: [-6, 59], Nozzle_RR2: [6, 59], Nozzle_RR1: [17, 59] };

export class Hud {
  constructor(root) {
    this.root = root;
    this.speedEl = root.querySelector('#speed');
    this.cols = [];
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('div'); d.className = 'digit';
      const col = document.createElement('div'); col.className = 'col';
      col.innerHTML = Array.from({ length: 11 }, (_, k) => `<span>${k % 10}</span>`).join('');
      d.appendChild(col); this.speedEl.appendChild(d); this.cols.push({ d, col });
    }
    this.dotsEl = root.querySelector('#dots');
    this.dots = new Map();
    this.tc = root.querySelector('#tc'); this.arc = root.querySelector('#tcArc'); this.year = root.querySelector('#tcYear');
    this.shown = 0; this.quiet = 0; this.lastMph = 0; this.disp = 0; this.visible = true; this.mode = 'chase';
    this.arcLen = 2 * Math.PI * 19;
  }

  update(dt, d) {
    const fpp = d.view !== 'chase';
    this.root.classList.toggle('off', fpp || d.hidden);
    if (fpp || d.hidden) return;
    const v = Math.max(0, Math.min(999, Math.round(d.mph)));
    const digits = [Math.floor(v / 100) % 10, Math.floor(v / 10) % 10, v % 10];
    const show = [v >= 100, v >= 10, true];
    for (let i = 0; i < 3; i++) {
      const c = this.cols[i];
      if (c.target === undefined) { c.target = digits[i]; c.pos = digits[i]; }
      if (digits[i] !== c.target) {
        const up = (digits[i] - c.target + 10) % 10 <= 5;
        if (up && digits[i] < c.target) c.pos -= 10;
        if (!up && digits[i] > c.target) c.pos += 10;
        c.target = digits[i];
      }
      c.pos += (c.target - c.pos) * Math.min(1, dt * (i === 2 ? 30 : 18));
      if (Math.abs(c.target - c.pos) < 0.002) c.pos = c.target;
      const shown = ((c.pos % 10) + 10) % 10;
      c.col.style.transform = `translateY(${-shown * DIGIT_H}px)`;
      if (c.shown !== show[i]) { c.d.style.display = show[i] ? 'block' : 'none'; c.shown = show[i]; }
    }
    const th = d.thrusters;
    let thrusting = 0;
    for (const n of th.all) {
      let dot = this.dots.get(n.name);
      if (!dot) {
        const [x, y] = LAYOUT[n.name] || [0, 32];
        const el = document.createElement('i'); el.style.left = `${23 + x}px`; el.style.top = `${y}px`; this.dotsEl.appendChild(el);
        dot = { el, a: -1 }; this.dots.set(n.name, dot);
      }
      const a = n.attached ? n.valve : 0;
      thrusting = Math.max(thrusting, a);
      if (Math.abs(a - dot.a) < 0.004 && a < 0.02) continue;
      dot.a = a;
      dot.el.style.opacity = (n.attached ? 0.16 : 0.04) + 0.84 * a;
      dot.el.style.transform = `translate(${n.dir.x * 4 * a}px, ${n.dir.z * 4 * a}px) scale(${1 + 0.35 * a * Math.max(0, n.dir.y)})`;
      dot.el.style.boxShadow = a > 0.05 ? `0 0 ${4 + 6 * a}px rgba(255,255,255,${0.5 * a})` : 'none';
    }
    const armed = d.tc.armed;
    this.tc.classList.toggle('on', armed);
    if (armed) {
      const p = Math.min(1, d.mph / d.tc.trigger);
      this.arc.style.strokeDashoffset = `${this.arcLen * (1 - p)}`;
      if (this.year.textContent !== d.tc.yearLabel) this.year.textContent = d.tc.yearLabel;
    }
    const active = Math.abs(d.mph - this.lastMph) > 0.6 || thrusting > 0.02 || armed || d.input;
    this.lastMph += (d.mph - this.lastMph) * Math.min(1, dt * 2);
    this.quiet = active ? 0 : this.quiet + dt;
    this.root.classList.toggle('fade', this.quiet > 3);
  }
}
