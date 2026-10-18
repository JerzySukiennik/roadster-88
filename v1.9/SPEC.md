# Roadster 88 — Part 1 spec

Source of truth for Part 1. Decisions come from Jurek's Q&A session (2026-10-15). Numbers live in `shared/tuning.json`, file and naming contracts in `CONTRACT.md`.

## What it is
A photoreal game about the 2nd-gen Tesla Roadster with the SpaceX package: it drives like a real hypercar, hops and flies on vectored cold-gas thrusters, and time travels DeLorean-style at 88 mph.

**Part 1** = the complete car and every car system on a grey test plate. No map, no story, no NPCs. Time travel in Part 1 is the full jump sequence plus a time-of-day change; the year only changes labels (eras arrive in Part 2).

**Built twice, same spec, same numbers:** `web/` (three.js, browser) and `godot/` (Godot 4.6.2, native macOS app). Jurek plays both and picks the engine for Part 2+. Both read the same `shared/tuning.json` and must produce the same physics metrics (see Parity).

## Pillars (in order)
1. **Feel.** Driving, boosting, hopping, flying and crashing must be satisfying and pleasant. Responsiveness, weight, sound and camera sell it. If something is technically right but feels bad, it is wrong.
2. **Graphics at Cyberpunk 2077 *quality level*** (not the neon aesthetic): physically based car paint with clearcoat and metallic flake, convincing reflections, tinted glass, emissive LEDs, soft shadows, AO, HDR with filmic tonemapping, TAA. The car, light and camera are where we get close.
3. **No visible lag** on the target machine: Intel MacBook Pro 2019, AMD Radeon Pro 5500M 4 GB, macOS 26. Quality presets Low / Medium / High / Ultra plus dynamic resolution. Design can beat 60 fps, never at the cost of visible stutter.

## The car
- 2nd-gen Roadster (2017 reveal / 2020 concept shape), 2+2 seats, removable glass targa roof, red multi-coat default. References: `Niepotrzebne/refs/1-6.png`.
- SpaceX package:
  - **Rear:** 4 cold-gas nozzles in the rear diffuser (ref 3). Gimballed, visibly rotating live: aft (boost) to straight down (lift), plus small side deflection.
  - **Front:** 2 nozzles hidden behind a flap in the front bumper (license plate area). On use the flap opens and the nozzles extend on a gimbal, then retract and the flap closes a moment after the last use. At rest the car looks stock. Front nozzles point forward (retro/brake) to straight down (lift).
  - **Optional static rear wing** (refs 3 and 6), toggle in settings. Static = visual plus a fixed downforce/drag term, no active aero.
- Paint options: Red Multi-Coat (default), Pearl White Multi-Coat, Solid Black, Midnight Silver Metallic, Deep Blue Metallic.
- **Driver: Jurek's avatar** (`Avatar/Output/full-v1`, rig v2) in RTFKT AR hoodie (hood down), H&M sweatpants, green Crocs. Seated pose, hands on the steering wheel via IK and following steering, right hand reaches to the touchscreen when the player taps it, head follows the FPP look direction. Outfit switch in settings (existing wardrobe items only). Face may be public (Jurek's decision).
- Doors open/close (animation, key F) but no getting out in Part 1.

## Physics (real Roadster numbers, semi-sim with flight assist)
- Rigid body car with raycast suspension per wheel, slip-based tyre model (Pacejka-lite), AWD three motors. Values in `tuning.json`.
- Targets (must be met within 5 percent, measured by the parity harness):
  - 0-60 mph on motors only: **1.9 s**. With boost (rear thrusters aft): **1.1 s**.
  - Top speed **250 mph**, electronic limiter (ground and air).
  - 60-0 mph braking: about 32 m on tyres only, noticeably shorter with front thrusters.
  - Lateral grip about 1.3 g. Throttle can break traction at low speed (controllable slides, not twitchy).
- Thrusters: unlimited gas (Jurek's rule: no resources that limit fun, no cooldowns, no overheating). Valves have short open/close times; gimbals have a finite slew rate, both visible.
- **Lift:** Space vectors both pairs toward down. Tap Space = hop (clear gaps), hold = climb or hover. Ctrl = descend. W/Shift with Space blend continuously (e.g. nozzles at 45 degrees climb and accelerate). On the ground, Shift boost and the front retro brake work while driving normally.
- **In the air, rotation comes only from differential nozzle thrust** (physically consistent): yaw from left/right rear differential and side deflection, pitch from front versus rear vertical component, roll from left versus right. A flight computer (control allocator) turns player intent into per-nozzle angle and throttle. You see every puff.
- **Flight assist (default on):** holds the car level, damps rotation rates, compensates damaged nozzles as far as physically possible. Assist off: arrows give direct pitch/roll and nothing holds you level.
- Air: gravity, momentum, aero drag. Landing is absorbed by the suspension; the car is always a car (wheels stay, no modes).

## Controls (keyboard and mouse only, no gamepad)
| Key | Ground | Air |
|---|---|---|
| W | motors forward | rear thrust forward |
| S | brake, reverse at standstill | front retro thrust |
| A / D | steer | yaw |
| Shift | boost: rear nozzles aft, full | same |
| Space | tap: hop, hold: lift | climb / hover |
| Ctrl | (none) | descend |
| Arrows | (none) | manual pitch/roll (tricks; full control with assist off) |
| Mouse | 3rd person: orbit camera. FPP: head look | same |
| Left click | FPP: tap the touchscreen at the gaze dot | same |
| C | toggle 1st / 3rd person | same |
| T | arm / disarm time circuits | same |
| R | new Roadster next to the wreck (wreck stays) | same |
| F | doors open/close | same |
| Esc | pause, quality preset, key list | same |
Pointer lock in the browser. Keys must be rebind-free but listed on the pause screen.

## Cameras
- **3rd person chase:** spring-damped follow, slight look-ahead along velocity, FOV widens with speed, subtle shake on boost, thrust and impacts. Mouse orbits; it recentres after about 2 s of no mouse input. Never clips into the ground or walls.
- **FPP (driver eye):** mouse look (yaw about ±140°, pitch about ±60°), the avatar's neck/head follows. Small centre dot. Full interior. Cracked windshield limits the view.

## HUD (3rd person only) — almost nothing, Tesla/Apple feel
- **Lower left:** speed in mph as a lone number in SF Pro (stack: `SF Pro Display`, `-apple-system`, `BlinkMacSystemFont`, `Inter`), digits roll/morph smoothly, no unit label.
- **Bottom centre:** six tiny dots laid out like the nozzles seen from above (2 front, 4 rear). Brightness = throttle, a small offset = vector direction.
- **Time circuits armed:** a thin amber progress arc toward 88 next to the speed, plus the destination year in small type. Nothing when disarmed.
- Everything fades out after about 3 s of nothing happening. Must never cover the car.
- FPP has no HUD: speed is on the car's own displays.

## Touchscreen (interactive in FPP: gaze dot + click)
Tesla-style UI rendered to a texture on the in-car screen. Apps:
1. **Time Circuits** (the core): three rows DESTINATION TIME / PRESENT TIME / LAST TIME DEPARTED, each month, day, year, hour:minute. Red, green and amber appear only as thin accents (film nod), typography is clean SF Pro with smoothly rolling digits. Arm toggle. Presets for the seven eras (Hadean about 4.0 billion years ago, 66 million BC, 1885, 2026, 2080, about 2600 ruins, about 12,000 sci-fi) plus free date entry via an on-screen keypad. Deep-past years render like `66,000,000 BC`.
2. **Map:** top-down map of the test plate with the car position and heading (valley in Part 2).
3. **Car:** flight assist on/off, paint, targa roof on/off, wing on/off, outfit, repair (same as R).
4. **Radio:** era stations, music follows the PRESENT era (Part 1: the label). CC-licensed music only.
Plus a small driver display behind the wheel with speed and gear (P R N D).

## Time travel (classic DeLorean)
- T arms the circuits (sound plus indicator). Circuits auto-disarm after each jump.
- From about 70 mph while armed: blue-white electrical arcs crawl over the body, flux hum and crackle build.
- At 88.0 mph: white flash and implosion, double sonic boom, the car vanishes. On the ground two fire trails remain behind the tyre paths; in the air a burning ring. The 3rd-person camera stays in the departure time for about 1.2 s to show this, then a flash cut to the destination time where the car reappears at the same position and velocity with a lightning crackle and vapour/frost coming off the body. In FPP: flash, then you are there.
- Part 1: the world stays the grey plate. Sun position follows the destination hour and month. PRESENT and LAST DEPARTED update.

## Damage (realistic, like IRL)
- **Node-beam soft body (BeamNG-lite):** a lattice of roughly 150-250 nodes covering the car volume with crumple zones front and rear and a stiffer cabin. Beams deform plastically past yield and break past their limit. The render mesh is skinned to the lattice. The lattice runs substepped while active (impacts, scraping) and sleeps back to rigid otherwise.
- Dents where you hit; at mega speed the car literally folds.
- Glass cracks radiating from the impact point, then shatters into shards on big hits.
- Detachable parts with break thresholds: front and rear bumpers, front flap, doors, mirrors, wing, targa roof, wheels (with suspension), nozzles. Detached parts become rigid bodies.
- **Damage affects driving:** bent suspension = toe/camber offset (car pulls), lost wheel = three wheels, damaged nozzle = weaker or misaligned thrust (assist compensates as far as possible), cracked windshield limits the FPP view.
- No HP bar, no slow-motion. The car keeps going as long as physics allows.
- **Wreck stays** where it is. R spawns a new Roadster about 5 m beside it. Keep at most 8 wrecks (oldest removed).

## Thruster look
Visible but realistic: short white condensation plume at the nozzle that dissipates quickly, refraction shimmer, frost building on the nozzles after sustained use. Near the ground a dust/debris ring and a push on light props (cones, barrels, pallets). Boost = a big plume. Valve open/close = a sharp puff.

## Sounds
- **EV motor: synthesized live** (layered tonal whine with gear-reduction harmonics tracking motor rpm, inverter switching noise, load-dependent; regen whine when braking). Wind and tyre roll/skid by speed.
- **Everything else fetched** (CC0 preferred, CC-BY with credit, Mixkit licence OK): cold-gas hiss with start/stop transients (layered with filtered noise for continuous control), metal crunch layered by impulse, glass crack and shatter, scrape loop, part clunks, time-travel arm beep, flux build-up, electric crackle, double boom, fire whoosh, arrival lightning, touchscreen taps, door, flap servo, radio music per era.
- Never Kenney `confirmation_001.ogg`. Every file listed in `CREDITS.md`. Both `.ogg` and `.mp3`.

## Graphics notes
- Filmic tonemapping (AgX or ACES), HDR, TAA, bloom, subtle speed-based motion blur, sun lens flare when looking near the sun. No film grain or chromatic aberration. No depth of field except maybe in FPP when looking at the screen.
- Physically based sky with a real sun position. Default: day. Time travel can land you at any hour (night = headlights, tail light bar, interior screen glow).
- Car paint must read like refs 1, 2 and 5: deep red with sharp clearcoat reflections.

## Test plate (Part 1 world)
A neutral grey proving ground, prototype look (subtle 1 m grid, numbered markers, colour-coded zones), physically lit. Contains:
- Long straight about 2 km (88 mph and top-speed runs).
- Ramps of several heights and gaps/ravines to jump with thrusters.
- Concrete walls, shipping containers, pillars and poles for crash tests. Light props (cones, barrels, pallets) blown by thrust.
- Towers and landing platforms at about 10, 25, 50 and 100 m.
- Stunt course: loop, banked turns, half-pipe, slalom cones.

## Parity
Both engines ship a headless harness that drives the car with scripted inputs and prints the same metrics: 0-60 (motors, boost), time to 88 mph, 60-0 (tyres, tyres plus retro), top speed, hover throttle, hop apex for a 0.3 s Space tap, steady-state turn radius at 60 mph full lock, hover yaw rate with A held. Results go to `shared/parity.md`. A tuning change goes into `shared/tuning.json` and both engines must still match.

## Out of Part 1
Map/valley, eras, causality system, NPCs, dinosaurs, walking on foot, story. Do not build them.
