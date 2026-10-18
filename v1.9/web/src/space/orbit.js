// Roadster 88 orbit: a circular orbit propagated in an inertial frame tied to the shared server clock (so every client agrees on where an orbit is), the rotating local frame of the pocket (up radial, north-ish forward, west left), the Earth turning underneath, and the pack/unpack used to share an orbit and a car's place on it over the network. Metres, float64.
import * as THREE from 'three/webgpu';
import { R_EARTH, enuBasis } from './astro.js';

export const GM = 3.986004418e14;
export const OMEGA_E = 7.2921159e-5;
const _q = new THREE.Quaternion();

export function earthTurn(T) { return (OMEGA_E * T) % (Math.PI * 2); }
export function eciToEcef(v, T, out) { const a = -earthTurn(T), c = Math.cos(a), s = Math.sin(a); return out.set(c * v.x - s * v.y, s * v.x + c * v.y, v.z); }
export function ecefToEci(v, T, out) { const a = earthTurn(T), c = Math.cos(a), s = Math.sin(a); return out.set(c * v.x - s * v.y, s * v.x + c * v.y, v.z); }

export class Orbit {
  constructor() {
    this.P = new THREE.Vector3(); this.h = new THREE.Vector3(0, 0, 1); this.N = new THREE.Vector3(0, 1, 0); this.T = 0;
    this.Beci = new THREE.Matrix3(); this.B = new THREE.Matrix3(); this.Bt = new THREE.Matrix3(); this.anchor = new THREE.Vector3();
    this._x = new THREE.Vector3(); this._y = new THREE.Vector3(); this._z = new THREE.Vector3();
  }

  start(lat, lon, alt, T, incDeg = 51.6) {
    const b = enuBasis(lat, lon);
    const up = new THREE.Vector3(...b.up), north = new THREE.Vector3(...b.north), east = new THREE.Vector3(...b.east);
    const inc = Math.max(incDeg, Math.abs(lat) + 1) * Math.PI / 180;
    const az = Math.asin(Math.max(-1, Math.min(1, Math.cos(inc) / Math.cos(lat * Math.PI / 180))));
    const v = north.clone().multiplyScalar(Math.cos(az)).addScaledVector(east, Math.sin(az));
    ecefToEci(up.clone().multiplyScalar(R_EARTH + alt), T, this.P);
    ecefToEci(up.clone().cross(v).normalize(), T, this.h);
    ecefToEci(north, T, this.N);
    this.T = T;
    return this;
  }

  copy(o) { this.P.copy(o.P); this.h.copy(o.h); this.N.copy(o.N); this.T = o.T; return this; }

  rate() { const r = this.P.length(); return Math.sqrt(GM / (r * r * r)); }

  propagate(T) {
    const dt = T - this.T;
    if (dt === 0) return this;
    const ang = this.rate() * dt;
    _q.setFromAxisAngle(this.h, ang);
    this.P.applyQuaternion(_q); this.N.applyQuaternion(_q);
    this.T = T;
    return this;
  }

  frame(T) {
    this.propagate(T);
    const y = this._y.copy(this.P).normalize();
    const z = this._z.copy(this.N).addScaledVector(y, -this.N.dot(y)).normalize();
    const x = this._x.crossVectors(y, z);
    this.N.copy(z);
    this.Beci.set(x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z);
    const a = -earthTurn(T), c = Math.cos(a), s = Math.sin(a);
    const R = new THREE.Matrix3().set(c, -s, 0, s, c, 0, 0, 0, 1);
    this.B.copy(R).multiply(this.Beci);
    this.Bt.copy(this.B).transpose();
    eciToEcef(this.P, T, this.anchor);
    return this;
  }

  displace(dPocket) {
    this.P.add(this._x.copy(dPocket).applyMatrix3(this.Beci));
    const radial = this._y.copy(this.P).normalize();
    this.h.addScaledVector(radial, -this.h.dot(radial)).normalize();
  }

  pack() {
    const r = (v) => Math.round(v * 10) / 10, u = (v) => Math.round(v * 1e6) / 1e6;
    return [r(this.P.x), r(this.P.y), r(this.P.z), u(this.h.x), u(this.h.y), u(this.h.z), u(this.N.x), u(this.N.y), u(this.N.z), Math.round(this.T * 1000) / 1000];
  }

  static unpack(a, out = new Orbit()) {
    out.P.set(a[0], a[1], a[2]); out.h.set(a[3], a[4], a[5]).normalize(); out.N.set(a[6], a[7], a[8]).normalize(); out.T = a[9];
    return out;
  }
}
