# Roadster 88 — contracts

Everything shared between the Blender model, the three.js build and the Godot build. If you need to change a contract, change this file and say so in your report.

## 1. Folders and ownership
| Path | What | Owner |
|---|---|---|
| `SPEC.md`, `CONTRACT.md` | spec and contracts | lead |
| `shared/tuning.json` | every physics/feel number, read by both engines at startup | both engines (log every change in `shared/TUNING-LOG.md`) |
| `shared/lattice.json` | damage lattice for the real car | lead (ships with the car) |
| `shared/parity.md` | harness results from both engines | both engines |
| `assets/car/roadster.glb` | the car (section 3) | lead (Blender scripts in `blender/`) |
| `assets/car/placeholder.glb` or procedural placeholder | stand-in until the real car lands, same node names | engines |
| `assets/driver/` | avatar body and garments copied from `Avatar/Output/full-v1` (done) | read-only for engines |
| `assets/audio/` + `assets/audio/catalog.json` | all sound files and the catalog (section 6) | sound agent |
| `web/` | three.js build, served as static files, loads `../assets/` and `../shared/` | web engine |
| `godot/` | Godot 4.6.2 project; may sync `assets/` and `shared/` into the project with a script, never edit the originals there | Godot engine |
| `Niepotrzebne/` | harness scripts, renders, scratch, tool configs | anyone, keep it tidy in subfolders |
| `CREDITS.md` | every third-party file with licence and URL | sound agent, anyone adding assets |

Language: code, comments, docs in English. No comments in final code except a short header per file (Jurek's rule). Never write partial files.

## 2. Frames and units
- SI units: metres, kilograms, seconds, newtons. Speeds in m/s internally; mph only for display and the 88 trigger (1 mph = 0.44704 m/s).
- **Car frame in glTF:** +Y up, **+Z forward** (direction of travel), +X = the car's left. Right-handed. Same convention as the avatar (`Left = +X`, faces +Z).
- Car origin: ground level (tyre contact plane at static ride height), midway between the front and rear axle lines, on the centre line.
- Godot imports glTF as-is, so the car faces +Z in Godot (Godot's "back"). Handle that in code; do not re-export the model.
- Physics fixed step: `physics_hz` in tuning (120). Render interpolates.

## 3. Car GLB (`assets/car/roadster.glb`)
One root node `Roadster`. Every movable or detachable thing is its own node with its pivot where it rotates. Names are exact.

**Body and panels** (each a mesh, all use material `Paint` where painted):
`Body_Shell` (monocoque: sides, sills, rear clamshell, A-pillars, roof frame), `Hood`, `Frunk_Lid` (if separate), `Bumper_F`, `Bumper_R` (with diffuser), `Door_L`, `Door_R` (pivot on the hinge axis, opens by rotating about local Y), `Mirror_L`, `Mirror_R`, `Roof_Targa` (removable glass panel), `Flap_F` (front bumper flap, pivot on its hinge), `Wing` (static wing plus struts, hidden by default), `Underbody`.

**Glass:** `Glass_Windshield`, `Glass_Rear`, `Glass_Door_L`, `Glass_Door_R`, `Glass_Quarter_L`, `Glass_Quarter_R`. Material `Glass_Tint` (dark, like the refs) or `Glass_Clear`.

**Lights:** `Light_Head_L`, `Light_Head_R` (emissive LED strip material `LED_Head` plus a lens), `Light_Tail` (full-width bar, material `LED_Tail`), `Light_Brake` (if separate). Engines add their own light sources at empties `Lamp_Head_L`, `Lamp_Head_R`, `Lamp_Tail`.

**Wheels:** `Wheel_FL`, `Wheel_FR`, `Wheel_RL`, `Wheel_RR` (pivot at hub centre; children `Tire_*`, `Rim_*`, spin about local X). `Brake_FL..RR` (disc + caliper, steer with the front wheels, do not spin). Front wheels steer about local Y of `Steer_FL`/`Steer_FR` empties that parent `Wheel_FL/FR` and `Brake_FL/FR`.

**Nozzles:** rear `Nozzle_RL1`, `Nozzle_RL2`, `Nozzle_RR1`, `Nozzle_RR2` (L = left = +X, 1 = outer). Pivot at the gimbal centre; at rest the exhaust axis is local **-Z** (pointing aft, thrust pushes the car +Z). With right-handed rotations, rotating about local X by **-90°** points the exhaust down. Front `Nozzle_FL`, `Nozzle_FR` (x = ±0.13) under `NozzleMount_F` (an empty at (0, 0.30, 2.10) that slides +Z by `front.deploy_travel_m` to extend through the opened `Flap_F`). At rest their exhaust axis is local **+Z** (forward, thrust pushes the car -Z); rotating about local X by **+90°** points it down. Each nozzle has a child empty `Exhaust_<nozzle name>` at the nozzle exit. Always verify directions from the actual exhaust empty, not from this sentence.

**Interior:** `Interior` (dash, seats, console, door cards, carpets), `SteeringWheel` (pivot on the column, rotates about its local Z), `Screen` (centre touchscreen mesh, UV 0..1 covering exactly the visible display, aspect 16:10, material `Screen`), `Cluster` (small display behind the wheel, UV 0..1, material `Cluster`).

**Empties (anchors):** `Seat_Driver` (avatar hip/pelvis target, local +Z forward), `Grip_L`, `Grip_R` (hand targets on the wheel rim, children of `SteeringWheel`), `Eye_Driver` (FPP camera), `COM` (centre of mass), `Lamp_*`, `Cam_Chase` (suggested chase target).

**Materials (names exact, engines may swap):** `Paint` (clearcoat, metallic flake; engines recolour), `Paint_Black` (gloss black trim), `Carbon`, `Chrome`, `Rubber`, `Tire`, `Rim`, `Brake_Disc`, `Caliper`, `Glass_Tint`, `Glass_Clear`, `Lens`, `LED_Head`, `LED_Tail`, `Interior_Leather` (white), `Interior_Dark`, `Alcantara`, `Nozzle_Metal`, `Screen`, `Cluster`, `Underbody`.

**Extras:** each detachable mesh carries glTF `extras` `{ "part": "<name>", "detach": true }`; panels that should crumple carry `{ "deform": true }`.

**Budget:** body LOD0 about 150-250k tris total with interior, textures 2K (4K only for paint flake normal if needed), Draco or meshopt compression allowed (both engines must load it: Godot 4.6 reads meshopt? If not, ship an uncompressed `roadster_raw.glb` too).

A lighter LOD with identical nodes ships as `assets/car/roadster_lod1.glb` (~310k tris vs ~720k): use it for the Low/Medium presets or as a distance LOD.

Until the real car exists, engines build a placeholder with **the same node names and pivots** (boxes are fine) so swapping is a file replace.

## 4. Damage lattice (`shared/lattice.json`)
```json
{
  "version": 1,
  "nodes": [ { "id": 0, "p": [x, y, z], "m": 9.5, "zone": "front" } ],
  "beams": [ { "a": 0, "b": 1, "k": 2.4e6, "d": 900, "yield": 0.015, "break": 0.22, "class": "crumple" } ],
  "parts": [ { "name": "Bumper_F", "nodes": [0, 1, 2], "break_impulse": 9000 } ],
  "wheels": { "Wheel_FL": [12, 13, 14] },
  "nozzles": { "Nozzle_RL1": [40, 41] }
}
```
- Positions in the car frame (section 2). `m` sums to the car mass. `k` N/m, `d` N·s/m, `yield` and `break` as strain (|L - L0| / L0). Plastic rule: past `yield`, the rest length moves toward the current length (plastic set); past `break`, the beam is removed. Zones: `front`, `rear`, `cabin`, `floor`, `roof`, `wheel`, `part`.
- Engines bind every render vertex of `deform: true` meshes to the nearest 4 nodes (inverse-distance weights, rest offsets in the node's rest frame), and detachable parts to their `nodes`.
- Until the real lattice ships, engines generate a placeholder lattice procedurally from the car's bounding volume in the same format.

## 5. Avatar driver
- Source: `/Users/jurek/Downloads/Claude/Projects/Avatar/Output/full-v1/` (read `CONTRACT.md` there). Body `character_v2/character_nude_v2.glb` (or `_mobile` for Low/Medium presets), garments in `clothes_v2/`: `rtfkt-ar-hoodie.glb`, `sweatpants-hm/`, `crocs-green.glb`. Other garments for the outfit switch: `biedronka-tee`, `rtfkt-nike-af1-tee`, `tnf-quest-jacket`, `cap-rtfkt-murakami`, `gzowo-glass`, `stapleverse-pigeon-hoodie`.
- Loader rule from the avatar contract: rebind garment bones to the body skeleton by name, keep `Cloth_*` bones. Reference implementation: `loadRuntime` in `Output/full-v1/editor/main.js`. IK reference: `Avatar/Film/rigpose.js`, grips: `Avatar/Film6/hands.js`.
- Already copied: `assets/driver/character_nude_v2.glb`, `character_nude_v2_mobile.glb`, `garments/*.glb` + `*.item.json` (sweatpants as `garments/sweatpants-hm.glb`), `AVATAR-CONTRACT.md`. Load only from `assets/driver/` at runtime. Never modify the Avatar project.
- Seated: pelvis at `Seat_Driver`, hands at `Grip_L/R` via IK, right hand reaches the touch point when tapping, head yaw/pitch follow FPP look. In FPP hide the head meshes (or near-clip them) so the camera never sees inside the head.

## 6. Audio catalog (`assets/audio/catalog.json`)
```json
{
  "thrust_loop": { "files": ["thrust_loop_a.ogg", "thrust_loop_a.mp3"], "loop": true, "gain": 0.8, "licence": "CC0", "source": "https://..." },
  "thrust_start": { "files": [...], "variants": 3 }
}
```
Keys the engines expect (sound agent fills them, engines must not crash if one is missing): `thrust_loop`, `thrust_start`, `thrust_stop`, `valve_puff`, `boost_big`, `flap_servo`, `tyre_skid_loop`, `tyre_roll_loop`, `wind_loop`, `suspension_thump`, `impact_light`, `impact_medium`, `impact_heavy`, `metal_crunch`, `metal_scrape_loop`, `glass_crack`, `glass_shatter`, `part_clunk`, `tc_arm`, `tc_disarm`, `tc_flux_loop`, `tc_crackle`, `tc_boom_double`, `tc_fire_whoosh`, `tc_arrive_zap`, `ui_tap`, `ui_toggle`, `door_open`, `door_close`, `radio_static`, `music_<era>` (eras: `hadean`, `dino`, `1885`, `2026`, `2080`, `ruins`, `scifi`; `hadean` may be an ambient drone, not music).
EV motor and the continuous part of the thrust hiss are synthesized in-engine.

## 7. Eras (labels in Part 1)
| id | label | default destination |
|---|---|---|
| `hadean` | Hadean | 4,000,000,000 BC |
| `dino` | Late Cretaceous | 66,000,000 BC |
| `1885` | Wild West | Sep 2 1885 08:00 |
| `2026` | Today | Oct 15 2026 14:00 |
| `2080` | Near future | Jun 21 2080 20:30 |
| `ruins` | Ruins | 2600 |
| `scifi` | Far future | 12,000 |
Era of a year = the nearest preset at or before that year.
