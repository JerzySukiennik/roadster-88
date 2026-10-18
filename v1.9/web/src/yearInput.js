// Roadster 88 year entry: press Y in any view, type a year (minus or B toggles BC), Enter sets the time-circuit destination, Esc cancels; keys are captured while the field is open so the car does not move.
import { formatYear } from './sim/timetravel.js';

const MIN = -4600000000, MAX = 999999999;
const group = (s) => (s.length > 4 ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : s);

export class YearInput {
  constructor(game) {
    this.g = game; this.open = false; this.buf = ''; this.bc = false;
    this.el = document.getElementById('yearIn');
    this.val = document.getElementById('yiVal');
    this.sub = document.getElementById('yiSub');
    addEventListener('keydown', (e) => this.key(e), true);
  }

  key(e) {
    const g = this.g;
    if (!this.open) {
      const typing = document.activeElement && document.activeElement.tagName === 'INPUT';
      if (e.code === 'KeyY' && !e.repeat && g.started && !g.paused && !(g.menu && g.menu.open) && !typing) { e.preventDefault(); e.stopPropagation(); this.show(); }
      return;
    }
    e.preventDefault(); e.stopPropagation();
    if (e.code === 'Escape' || e.code === 'KeyY') { this.hide(); return; }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { this.commit(); return; }
    if (e.code === 'Backspace') this.buf = this.buf.slice(0, -1);
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.code === 'KeyB') this.bc = !this.bc;
    else if (/^(Digit|Numpad)[0-9]$/.test(e.code) && this.buf.length < 10) { if (!(this.buf === '' && e.code.endsWith('0'))) this.buf += e.code.slice(-1); }
    else return;
    if (g.audio) g.audio.play('ui_tap', { inside: true, gain: 0.35 });
    this.render();
  }

  show() {
    this.open = true; this.buf = ''; this.bc = false;
    this.el.classList.add('on');
    this.render();
  }

  hide() {
    this.open = false;
    this.el.classList.remove('on');
  }

  value() {
    if (!this.buf) return null;
    let y = Number(this.buf) * (this.bc ? -1 : 1);
    if (y === 0) y = 1;
    return Math.max(MIN, Math.min(MAX, y));
  }

  render() {
    const y = this.value();
    if (y === null) {
      this.val.textContent = formatYear(this.g.tc.destination.year);
      this.val.classList.add('dim');
      this.sub.textContent = 'Type a year · B for BC · Enter';
    } else {
      this.val.textContent = group(String(Math.abs(y))) + (y < 0 ? ' BC' : '');
      this.val.classList.remove('dim');
      this.sub.textContent = 'Enter to set · Esc to cancel';
    }
  }

  commit() {
    const g = this.g, y = this.value();
    this.hide();
    if (y === null) return;
    g.tc.setDestination({ ...g.tc.destination, year: y });
    if (g.cockpit) g.cockpit.dirty = true;
    if (g.audio) g.audio.play('ui_toggle', { inside: true, gain: 0.6 });
    g.hint(g.tc.armed ? `Destination ${formatYear(y)} · reach 88 mph` : `Destination ${formatYear(y)} · press T to arm`, 3);
  }
}
