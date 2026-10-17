// Roadster 88 terrain worker: generates bands of the valley base height grid and surface masks off the main thread.
import { buildDesign } from './design.js';
import { generateRows } from './terrain.js';

const D = buildDesign();
self.onmessage = (e) => {
  const r = generateRows(D, e.data.iz0, e.data.iz1);
  self.postMessage({ id: e.data.id, ...r }, [r.H.buffer, r.S.buffer]);
};
