// Roadster 88 mega grid worker: generates bands of the 4 m mega grid base heights and surface masks off the main thread.
import { buildDesign } from './design.js';
import { generateOuterRows } from './outer.js';

const D = buildDesign();
self.onmessage = (e) => {
  const r = generateOuterRows(D, e.data.iz0, e.data.iz1);
  self.postMessage({ id: e.data.id, ...r }, [r.H.buffer, r.S.buffer]);
};
