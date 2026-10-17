# Roadster v2 (2026 production body, Rocket trim)

This is a from-scratch model of the Tesla Roadster shown at the 15 October 2026 unveil: an angular, faceted wedge with gullwing doors, a black glasshouse, a full-width light bar and 10 cold-gas thrusters. It lives in `assets/car/` and follows CONTRACT.md section 3, with the deviations listed below. Sources and build scripts are in `model2/` and the comparison sheets are in `model2/renders/final/`.

| File | What |
|---|---|
| `roadster.glb` | LOD0: about 316k tris, 124 nodes, 24 materials, 9 animation clips, embedded 1K PNG textures |
| `roadster_lod1.glb` | the same nodes, clips and materials, about 162k tris (Decimate 0.45 on meshes over 1.5k faces) |
| `../../shared/lattice.json` | damage lattice for this body: 199 nodes, 903 beams, mass 1950 kg, CONTRACT section 4 format |
| `../fx/` | cold-gas vapour flipbooks (8x8, 2048 px WebP). See `assets/fx/README.md` |

No compression is used (no Draco, no meshopt). The extensions used are `KHR_materials_clearcoat`, `KHR_materials_emissive_strength` and `KHR_texture_transform`.

## Frame and measured dimensions
- glTF frame: +Y up, +Z forward, +X = the car's left. The origin is on the ground, midway between the axles, on the centre line. Units are metres.
- The dimensions come from a 4-view bundle adjustment of the official photos and renders (side, top, front, 3/4 front), scaled by the tyre size.

| | value |
|---|---|
| wheelbase | **2.792** (axles at z = ±1.396) |
| length | 4.24 (nose z = 2.204, splitter z = 2.212, tail lip z = -2.030) |
| width | 1.89 body (±0.943); tyre outer faces about ±0.94 |
| roof height | 1.178 (at z = -0.04) |
| ground clearance | 0.128 |
| track front / rear | 1.590 / 1.580 (hub x = ±0.795 / ±0.790, hub y = 0.345) |
| tyres | front r 0.352, width 0.275; rear r 0.358, width 0.305; 21-inch rims (r 0.267) |

**Action for the engines:** `shared/tuning.json` still holds the old body (wheelbase 2.85, track 1.70/1.69, radius 0.347/0.364, length 4.47). Update those numbers and the collider box when you switch to v2. I did not touch `shared/`.

## Node tree (names and pivots)
Positions are the car-frame pivot in metres. A `*` marks a node that has a non-identity rest rotation.

- `Roadster` (root)
  - `Body_Shell` (0,0,0), deform. Monocoque with sides, sills, roof rails, A-pillars, rear deck and tail panel. Children: `Marker_L/R` (amber side markers), `Reflector_L/R`, `Pod_Nozzle_S*` (sill pods).
  - `Hood` (0, 0.80, 1.50): hinge at the windshield base. Detach + deform. This is also the frunk lid; there is no separate `Frunk_Lid`.
  - `Door_L` * (0.543, 1.049, 0.294), `Door_R` * (mirrored). **Gullwing doors.** The pivot sits on the roof-rail hinge line, and the node's **local Y is the hinge axis** (rest rotation baked in). The door opens by rotating about local Y by +118° (`door_L_open`, `door_R_open`). Children: `Glass_Door_*`, `Mirror_*` (a small side camera pod, the new car has no mirrors), `DoorCard_*`, `DoorArm_*`.
  - Glass: `Glass_Windshield`, `Glass_Rear`, `Glass_Quarter_L/R`, `Glass_Door_L/R` (under the doors) and `Roof_Targa` (0, 1.16, -0.08), the centre roof glass panel. All use the material `Glass_Tint`.
  - `Bumper_F` (0, 0.30, 2.05): the flat black front face, splitter and lower intake. `Flap_F` (0, 0.330, 2.186): the black panel in the front face (x ±0.48), hinged on its top edge. It opens inward by rotating about local X by +78°.
  - `Bumper_R` (0, 0.40, -1.95): black rear bumper, nozzle bar, carbon diffuser with 6 fins, and `Plate` ("RDSTR").
  - `Underbody` (0, 0.13, 0): floor plate and wheel-arch liners.
  - Lights: `Light_Head_L/R` (the full-width LED line along the hood leading edge, plus corner slits), `Light_Tail` (full-width bar under the tail lip, material `LED_Tail`). There is no separate `Light_Brake`. Lamp empties: `Lamp_Head_L/R` (±0.32, 0.51, 2.20), `Lamp_Tail` (0, 0.81, -2.04).
  - Wheels: `Steer_FL/FR` (±0.795, 0.345, 1.396) > `Wheel_F*` (spins about local X) > `Tire_*`, `Rim_*`, `Disc_*`; `Brake_F*` (caliper, steers, does not spin) > `Caliper_*`. Rear: `Wheel_RL/RR` (±0.790, 0.345, -1.396) and `Brake_RL/RR` are direct children of the root.
  - `Wing` (0, 0.905, -1.86) > `Wing_Body`: the active rear wing (blade, endplates, swan-neck struts). Detach. The rest pose is the low-drag position at the deck. Contract: hidden by default.
  - Interior: `Interior` (0, 0.40, 0) holds the tub, dash, console, two fixed bucket seats (`Seat_FL/FR`), column, and the bezels for screen and cluster. `SteeringWheel` * (0.36, 0.70, 0.30) has local Z along the column (tilted 24°) and rotates about local Z; it contains the yoke plus `Grip_L/R` (±0.155 from centre). `Screen` * (0, 0.79, 0.62): the centre display, 0.32 x 0.20 (16:10), UV 0..1 covers exactly the display, material `Screen`. `Cluster` * (0.36, 0.80, 0.52): 0.22 x 0.075, UV 0..1, material `Cluster`.
  - Anchors: `Seat_Driver` (0.36, 0.26, -0.30), `Eye_Driver` (0.36, 0.96, -0.52), `COM` (0, 0.45, -0.10), `Cam_Chase` (0, 1.7, -6.2).
  - Nozzles: see below.

glTF `extras`: every detachable mesh has `{"part": "<name>", "detach": true}`. `Body_Shell`, `Hood`, `Door_*`, `Bumper_*` and `Underbody` also have `"deform": true`.

## Thrusters (10, Rocket trim)
In the unveil videos the car fires thrusters in three places: four round nozzles in the rear bar, lift jets straight down from under the sills (behind the front wheels and ahead of the rear wheels), and jets out of the front corners (sideways and down during the kickflip and spin). The model has one nozzle group for each. Every nozzle has a child empty `Exhaust_<nozzle>` at its exit. As the contract says, read the thrust direction from the exhaust empty, not from this table.

| node | parent | gimbal pivot | rest exhaust axis | to point down | other vectoring |
|---|---|---|---|---|---|
| `Nozzle_RL1` / `RL2` / `RR2` / `RR1` | root | (+0.36 / +0.12 / -0.12 / -0.36, 0.495, -1.975) | -Z (aft, thrust pushes +Z) | local X **-90°** | local Y ±20° for yaw |
| `Nozzle_FL` / `FR` | `NozzleMount_F` | (±0.40, 0.29, 2.02) | +Z (forward, retro) | local X **+90°** | local Y: FL +90° / FR -90° points it outward sideways (the lateral jet in the videos) |
| `Nozzle_SL1`, `SL2`, `SR1`, `SR2` (new) | `NozzleMount_S` | SL1 (+0.80, 0.165, +0.86), SL2 (+0.80, 0.165, -0.90), SR1/SR2 mirrored at x = -0.80 | **-Y (down, thrust pushes +Y)** | already down | local X ±30° tilts fore/aft (positive goes aft), local Z ±30° tilts sideways (positive goes +X) |

- `NozzleMount_F` (0, 0.29, 2.05) slides +Z by 0.13 m (`front_nozzles_deploy`) after `flap_open`. **Deviation from the contract:** the front nozzles are at x = ±0.40, not ±0.13, so that they sit at the front corners like the lateral jets in the videos.
- `NozzleMount_S` (0, 0.16, 0) slides -Y by 0.055 m (`side_nozzles_deploy`), which drops the four lift nozzles out of their black sill pods (the gold nozzles under the sills in the 2026 photos). Rest is retracted; the allocator should only fire them when they are deployed.
- **For the allocator:** the side group gives pure lift with large roll and pitch arms (x ±0.80, z +0.86 / -0.90). The rear group gives boost aft, or lift when turned down. The front pair gives retro, lift, or lateral (yaw and sideways). All nozzles are detachable (`part` extras) and are also listed in `lattice.json` under `nozzles`.

## Animation clips
Each clip starts at t = 0. Its first key is exactly the rest pose and its last key is the end state, so engines can play the clip or scrub it by normalised time. All clips are sampled at 30 fps, eased (smoothstep) and stored on the contract nodes.

| clip | node(s) | channel | duration |
|---|---|---|---|
| `door_L_open`, `door_R_open` | `Door_L`, `Door_R` | rotation about local Y, 0 to 118° | 1.40 s |
| `flap_open` | `Flap_F` | rotation about local X, 0 to 78° | 0.33 s |
| `front_nozzles_deploy` | `NozzleMount_F` | translation +Z 0.13 m | 0.43 s |
| `front_nozzles_down` | `Nozzle_FL`, `Nozzle_FR` | rotation about local X, +90° | 0.50 s |
| `rear_nozzles_down` | `Nozzle_RL1/RL2/RR1/RR2` | rotation about local X, -90° | 0.50 s |
| `side_nozzles_deploy` | `NozzleMount_S` | translation -Y 0.055 m | 0.33 s |
| `wing_deploy` | `Wing` | translation +Y 0.17 m and -Z 0.10 m (low drag to high downforce) | 1.20 s |
| `targa_remove` | `Roof_Targa` | translation +Y 0.32 m and -Z 0.15 m (lift-off) | 1.50 s |

Steering, wheel spin and the live gimbal angles are left to code (rotate the nodes directly), as before.

## Materials
These are the contract names: `Paint` (Ano White satin, light clearcoat; engines can recolour it), `Paint_Black`, `Carbon` (twill texture plus normal map), `Chrome`, `Rubber`, `Tire` (tread normal map), `Rim` (gloss black blades), `Brake_Disc` (drilled carbon-ceramic texture), `Caliper` (gold, to match the 2026 car), `Glass_Tint`, `Lens`, `LED_Head`, `LED_Tail`, `Interior_Leather`, `Interior_Dark`, `Alcantara`, `Nozzle_Metal` (gold-anodised titanium), `Screen`, `Cluster` and `Underbody`.

There are four extras: `Rim_Disc` (light grey aero dish behind the spokes), `Lens_Tail`, `LED_Marker` (amber) and `Plate`. `Glass_Clear` is not used.

`Glass_Tint` is near-black (0.004) with a full clearcoat and alpha 0.84 (BLEND, double-sided). From outside it reads black and mirrors the environment, which is how the glass looks in the photos (the bronze in the top-view photo is the desert reflecting in it). Glass panels are single surfaces. **In FPP, lower the opacity of `Glass_Tint` to about 0.35** (one material parameter) so the road reads clearly. The darker exterior value is deliberate: it keeps the side windows from showing the floor straight through the cabin.

## Poly counts (LOD0 tris)
| group | tris |
|---|---|
| body shell, solidified 4 mm with panel edges and 2.5 mm crease bevels | 117k |
| hood, 2 doors, front and rear bumpers, flap, plate | 46k |
| glass | 24k |
| 4 tyres | 66k |
| 4 rims, 4 discs, 4 calipers | 42k |
| interior (tub, dash, console, seats, yoke, screens, door cards) | 6k |
| 10 nozzles, pods, wing, lights, underbody, markers | 15k |
| **total LOD0 / LOD1** | **about 316k / 162k** |

## Known gaps
- The geometry is a ruled facet loft between measured crease lines. It matches the photo silhouettes to within about 1 to 3 cm (see the overlays). The small surface details are approximated: the vents on the rear quarters, the exact facet split on the front fender corners, and the slot detail in the diffuser.
- The interior is simplified: fixed bucket seats, yoke, screens, dash, console and door cards. It has no buttons, vents or textures. The 2026 interior has not been photographed clearly.
- The wing is a plausible design built from the reveal renders (blade, endplates, swan-neck struts). The real high-downforce mechanism is more complex.
- Rims have 6 blade spokes with slots over a light dish; the brake disc is a texture, not real holes. The tyres have no sidewall lettering.
- The positions of the side and front thrusters are inferred from the unveil videos and the 2026 photos (gold nozzles under the sills); Tesla has not published exact positions.
- LOD1 is a straight decimation, not a hand-made LOD.
