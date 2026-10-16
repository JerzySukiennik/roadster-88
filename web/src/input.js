// Roadster 88 input: keyboard state with edge detection, mouse deltas with pointer lock, and the mapping to sim controls (fixed bindings, listed on the pause screen).
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set(); this.pressed = new Set(); this.released = new Set();
    this.mdx = 0; this.mdy = 0; this.clicks = 0; this.lastMouse = -99; this.locked = false; this.anyInput = false;
    this.steer = 0; this.virtual = null;
    const block = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
    addEventListener('keydown', (e) => {
      if (block.has(e.code) || (e.ctrlKey && e.code === 'KeyW')) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code); this.anyInput = true;
    });
    addEventListener('keyup', (e) => { this.down.delete(e.code); this.released.add(e.code); });
    addEventListener('blur', () => { this.down.clear(); });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mdx += e.movementX || 0; this.mdy += e.movementY || 0; this.lastMouse = performance.now() / 1000;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.anyInput = true;
      if (!this.locked) { this.requestLock(); return; }
      if (e.button === 0) this.clicks++;
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; if (this.onLockChange) this.onLockChange(this.locked); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestLock() {
    try { const p = this.canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => this.canvas.requestPointerLock()); } catch (e) { this.canvas.requestPointerLock(); }
  }

  is(code) { return this.virtual ? this.virtual.has(code) : this.down.has(code); }
  hit(code) { return this.pressed.has(code); }

  controls(dt) {
    const k = (c) => this.is(c);
    const left = k('KeyA'), right = k('KeyD');
    const target = (left ? 1 : 0) - (right ? 1 : 0);
    const rate = target === 0 ? 7 : Math.sign(target) !== Math.sign(this.steer) && this.steer !== 0 ? 9 : 5;
    this.steer += Math.max(-rate * dt, Math.min(rate * dt, target - this.steer));
    return {
      throttle: k('KeyW') ? 1 : 0,
      brake: k('KeyS') ? 1 : 0,
      steer: this.steer,
      boost: k('ShiftLeft') || k('ShiftRight'),
      lift: k('Space'),
      descend: k('ControlLeft') || k('ControlRight'),
      pitch: (k('ArrowUp') ? 1 : 0) - (k('ArrowDown') ? 1 : 0),
      roll: (k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0),
    };
  }

  consumeMouse() { const d = [this.mdx, this.mdy]; this.mdx = 0; this.mdy = 0; return d; }
  consumeClicks() { const c = this.clicks; this.clicks = 0; return c; }
  endFrame() { this.pressed.clear(); this.released.clear(); }
}
