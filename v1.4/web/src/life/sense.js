// Roadster 88 life senses: what creatures and people perceive of the player car each frame (position, velocity, height above ground, boost and thruster noise, hovering downwash, headlights) and the time-jump departure and arrival events, plus threat geometry (distance, closing speed, time to closest approach, miss distance).

export class CarSense {
  constructor(game, valley) {
    this.g = game; this.V = valley;
    this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0; this.speed = 0;
    this.agl = 0; this.air = false; this.boost = 0; this.thrust = 0; this.hover = 0; this.noise = 0; this.visible = true;
    this.events = []; this.tcState = 'off'; this.boostHeld = 0; this.lastBoostEvent = -9; this.time = 0;
  }

  update(dt) {
    this.time += dt;
    this.events.length = 0;
    const car = this.g.car; if (!car) return;
    const s = car.sim;
    this.x = s.pos.x; this.y = s.pos.y; this.z = s.pos.z;
    this.vx = s.vel.x; this.vy = s.vel.y; this.vz = s.vel.z; this.speed = s.speed;
    this.visible = car.view.root.visible && this.g.tc.state !== 'gone';
    const gy = this.V.heightAt(this.x, this.z);
    this.agl = this.y - gy; this.air = s.contacts === 0;
    const th = s.thrusters;
    let rear = 0, down = 0;
    for (const n of th.all) { if (!n.attached) continue; if (n.group === 'rear' && n.pitch < 0.4) rear += n.valve; if (n.dir && n.dir.y > 0.5) down += n.valve * n.thrustMax; }
    this.boost = rear / 4;
    this.thrust = Math.min(1.5, th.totalForce.len() / 40000);
    this.hover = this.air && this.agl < 40 ? Math.min(1, down / 30000) * (1 - this.agl / 40) : 0;
    this.noise = Math.min(1, this.speed / 45) * 0.7 + this.boost * 1.6 + this.thrust * 0.6;
    if (!this.visible) this.noise = 0;
    this.boostHeld = this.boost > 0.6 ? this.boostHeld + dt : 0;
    if (this.boostHeld > 0.15 && this.time - this.lastBoostEvent > 1.5) { this.lastBoostEvent = this.time; this.events.push({ type: 'boom', x: this.x, z: this.z, r: 140, level: 0.6 }); }
    const tc = this.g.tc.state;
    if (tc !== this.tcState) {
      if (tc === 'departing') this.events.push({ type: 'depart', x: this.x, z: this.z, r: 260, level: 1 });
      if (tc === 'arriving') this.events.push({ type: 'arrive', x: this.x, z: this.z, r: 320, level: 1 });
      this.tcState = tc;
    }
    this.lights = this.g.sky && this.g.sky.state ? this.g.sky.state.night > 0.3 : false;
  }

  dist(x, z) { return Math.hypot(x - this.x, z - this.z); }

  threat(x, z) {
    const rx = x - this.x, rz = z - this.z, d = Math.hypot(rx, rz) || 1e-3;
    const v2 = this.vx * this.vx + this.vz * this.vz, v = Math.sqrt(v2);
    const closing = (rx * this.vx + rz * this.vz) / d;
    let ttc = Infinity, miss = d;
    if (v > 0.5) { const t = (rx * this.vx + rz * this.vz) / v2; if (t > 0) { ttc = t; miss = Math.hypot(rx - this.vx * t, rz - this.vz * t); } }
    return { d, closing, ttc, miss, v };
  }
}
