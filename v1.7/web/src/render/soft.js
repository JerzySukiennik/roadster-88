// Roadster 88 soft particles: three.js r186 SoftParticles with the contrast curve's parameter renamed, since 'input' is a reserved word in GLSL and broke every smoke shader on WebGL2 (iPhone).
import { Fn, float, positionView, viewportDepthTexture, perspectiveDepthToViewZ, cameraNear, cameraFar } from 'three/tsl';

const contrastCurve = /*@__PURE__*/ Fn(([value, power]) => {
  const aboveHalf = value.greaterThan(0.5).toConst();
  const folded = aboveHalf.select(value.oneMinus(), value).toConst();
  const curved = folded.mul(2).saturate().pow(power).mul(0.5).toConst();
  return aboveHalf.select(curved.oneMinus(), curved);
}).setLayout({ name: 'softContrastCurve', type: 'float', inputs: [{ name: 'value', type: 'float' }, { name: 'power', type: 'float' }] });

export function softParticles({ opacity = float(1), distance = 1, contrast = 2, viewportDepth = viewportDepthTexture() } = {}) {
  const sceneViewZ = perspectiveDepthToViewZ(viewportDepth, cameraNear, cameraFar).toConst();
  const depthDelta = positionView.z.sub(sceneViewZ).div(distance).saturate();
  return opacity.mul(contrastCurve(depthDelta, contrast));
}
