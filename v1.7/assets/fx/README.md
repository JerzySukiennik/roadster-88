# Cold-gas vapour flipbooks

These were rendered in Blender Cycles from volumetric noise fields (script: `model2/fx_vapour.py`). Cold-gas thrust is white condensation vapour, not fire. They are made to match the unveil footage: narrow blue-white jets that widen quickly, a sharp puff when a valve opens, and large white billows that roll along the ground while the car hovers.

## Atlas layout (all four files)
- WebP (converted from the Cycles PNGs, quality 82), RGBA with straight (non-premultiplied) alpha, **2048 x 2048, 8 x 8 cells of 256 px, 64 frames**. Frame 0 is the top-left cell; frames run left to right, then top to bottom (frame i is at column i % 8, row i // 8).
- Colour is cold white (about 0.92, 0.95, 1.0) with soft lighting baked in from the upper left. Alpha is the vapour opacity. In the engine, multiply the colour by the scene light (ambient plus sun, or plus headlights at night). The sprites are unlit, so they hold up in both day and night scenes.
- Use alpha blending with no depth write and soft particles (depth fade over about 0.3 m) so the sprites do not clip where they meet the ground or the car.

| file | type | cell covers | anchor | loop |
|---|---|---|---|---|
| `vapour_jet.webp` | jet column, side view | **4.0 m (U, along the jet) x 1.25 m (V, across)**. The cell is not square: draw it on a 4.0 x 1.25 quad | the nozzle exit is the left edge, V centre (u = 0.012, v = 0.5) | **yes, frames 0-63 tile seamlessly** |
| `vapour_puff.webp` | valve puff, expansion to dissipation | 2.4 m x 2.4 m | centre | no (one-shot, frame 63 is nearly empty) |
| `vapour_ground.webp` | ground billow, side view | 6.0 m x 6.0 m | ground line is the **bottom edge**, centred | no (one-shot) |
| `vapour_ground_ring.webp` | hover ground spread, top view | 6.0 m x 6.0 m | centre = jet impact point | **yes, frames 0-63** |

## How to use per state
Jet start points and directions come from the `Exhaust_Nozzle_*` empties, which point along the exhaust axis. Throttle is t, from 0 to 1.

**Valve puff (idle blip, valve open/close, gimbal snap).**
- One `vapour_puff` sprite per nozzle per event, spawned at the exhaust with velocity 4 m/s along the exhaust axis.
- Play over 0.8 s (80 fps through the atlas). Size grows from 0.3 m to 1.4 m.
- Peak opacity 0.6, plus 2 to 3 smaller puffs at 0.5x size with random ±0.1 s delay.

**Jet (any nozzle firing).**
- One axis-aligned billboard per nozzle: a 4.0 x 1.25 quad along the exhaust axis, rotated about that axis to face the camera.
- Scale the length by 0.5 + 0.5t (rear boost up to 1.4x) and the width by 0.7 + 0.3t. Opacity is 0.35 + 0.6t.
- Loop the atlas at 30 fps plus 30 fps x t, so the flow speeds up with thrust.
- Add 15 + 25t puff particles per second per nozzle along the jet: life 1.0 s, size 0.4 to 2.0 m, velocity 6 + 6t m/s along the axis, plus 30% of the car velocity, drag 3/s, opacity 0.45 down to 0.
- **Boost** (rear group, aft, on the ground): use 1.4x jet length and 40/s puffs per nozzle with a 2.5 m end size. The trail should hang behind the car in a big white cloud as tall as the car (as in the boost clip).

**Hover / lift (side, rear and front groups pointing down).**
- Jet: clamp the billboard length to the height of the nozzle above the ground. If the jet reaches the ground, shorten it to that distance.
- Ground billow: at each impact point spawn `vapour_ground` sprites at 6 + 6t per second per jet. Each sprite is a camera-facing cylindrical billboard (rotating about vertical only) whose bottom edge sits on the ground.
  - Life 2.5 s. Size 2 m to 7 m, multiplied by (1.3 - h/4), where h is the nozzle height.
  - Outward drift 2 to 4 m/s away from the car centre. Opacity 0.55t.
- Ground ring: one `vapour_ground_ring` decal (a horizontal quad 5 cm above the ground) centred under the car's lift-weighted thrust point.
  - Size 4 m + 1.5 m x h, up to 9 m. Opacity clamp(1 - h/4.5) x t. Loop at 20 fps.
  - Rotate the decal slowly (0.1 rad/s) so the pattern does not freeze.
- The clouds linger: keep billows alive about 3 s after thrust stops and fade them. In the videos the vapour fills the whole stage.

**Frost (optional):** after more than 2 s of continuous thrust, lerp `Nozzle_Metal` toward pale grey-white (0.75, 0.78, 0.8) with roughness 0.6 over 3 s, and back over 6 s.

## Hero reference renders
`model2/renders/final/smoke_hover.png` (night hover with the lift jets and the ground cloud, like the kickflip and wall videos) and `model2/renders/final/smoke_boost.png` (rear boost plume) show the target look. They are full Cycles volumes on the actual car, not flipbooks.
