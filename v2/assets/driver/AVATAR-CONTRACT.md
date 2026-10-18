# Shared skeleton and garment contract (Jurek full body), rig v1

Everything in the wardrobe, the rig stage, the animation stage and the editor follows this file. Source of truth for numbers: `skeleton.json` (bone table), `landmarks.json` (joint positions from the mesh), `measurements.json`.

## 1. Frame and scale
- Blender: metres, **Z up, character faces -Y, Left = +X (Jurek's left)**, origin on the floor between the feet (soles at z = 0, mesh z min is about 0.00005).
- glTF/three.js (exporter `export_yup=True`): Y up, character faces +Z. The exporter maps Blender (x, y, z) to glTF (x, z, -y), so Left stays +X and forward (-Y) becomes +Z.
- Pose: **A-pose**, arms 35 deg from vertical (slightly forward flexed forearm), palms toward the thighs, legs 3 deg apart, feet toe-out 7 deg. Stature 1.740 m to the skull vertex (no hair).
- The v1 head is **not modified**. Its objects are moved up by `DZ = 1.623` m at object level (location only, vertices untouched). Head frame origin (between the ear canals) is therefore at z = 1.623. In the rigged files the head objects are children of the armature with a parent inverse that carries this offset.

## 2. Objects
`character_cinematic.blend` (full quality, curves hair, 4K head, Principled Hair) and `character_nude.glb` / `character.fbx` (realtime) contain:
| Object | What |
|---|---|
| `Jurek.Rig` | the only armature (92 bones, see 3). Armature data `Jurek.Rig`. At the origin, identity transform. |
| `Body` | one mesh, 8,016 vertices, 15,984 tris, UV `UVMap`, material `JurekBodySkin` (glTF: `BodySkin`), skinned (4 influences max). Vertex groups: the deform bones plus `mask_torso mask_neck mask_arms mask_forearms mask_hands mask_thighs mask_shins mask_feet` (non-bone groups, weight 1) and the float point attribute `_REGION` (0 torso, 1 neck, 2 upper arms, 3 forearms, 4 hands, 5 thighs, 6 shins, 7 feet; exported as `_REGION`). Never edit its topology or vertex order. |
| `Head` (glTF: one mesh `Head`: skin, teeth, gums, tongue; `Lashes`: lashes, tears, caruncles) | v1 head, frozen (names, vertex order, UVs, 78 shape keys incl. ARKit 52, 15 visemes, `corr_*`). Skinned to `Neck`, `Head`, `Jaw`. In the cinematic blend the head, teeth, gums, tongue, lashes... are separate objects exactly as in v1. |
| `Eye.L`, `Eye.R` | not skinned, parented to the bones `LeftEye` / `RightEye` (glTF: child nodes of those joints). |
| `Hair.*`, `Eyebrow.*` | strand hair medium LOD (`Hair.Strands.Medium`, `Hair.ScalpCap.Medium`, `Eyebrow.Strands.L/R` with brow morph targets) skinned to the `Hair_*` bones; cinematic blend also has curves hair (`Hair.Strands`, `Hair.Undercoat`, `Hair.Flyaways`, `Hair.WhorlPlug`, `Eyebrow.L/R`) bone-parented to `Head`, plus hidden LOD collections. |
Each mesh carries the custom property `role` = `body` / `face` / `hair`.

Neck join: the Body neck is its own mesh whose five top rings follow the v1 head neck surface; the visible intersection under the chin sits at z about 1.498. Rig stage added `Build/body/rig/neck_map.py` + `neck_mix.py`: Body baseColor/ORM texels above z 1.445 are blended to the Head textures sampled at the visible neck (weight smoothstep 1.445..1.49) and slightly darkened to the measured render of the Head neck. Result textures live in `Build/body/textures/rig/` and are what the rig files use.

## 3. Skeleton (Unity/Mixamo-style names, no `mixamorig:` prefix), 92 bones, all deforming
```
Hips
  Spine > Spine1 > Spine2
    Neck > Head > Jaw, LeftEye, RightEye, Hair_Root > Hair_* chains (37 bones, exactly the v1 names)
    LeftShoulder > LeftArm > LeftForeArm > LeftHand
        LeftHandThumb1-3, LeftHandIndex1-3, LeftHandMiddle1-3, LeftHandRing1-3, LeftHandLittle1-3
    RightShoulder ... (same, Right prefix)
  LeftUpLeg > LeftLeg > LeftFoot > LeftToeBase
  RightUpLeg > RightLeg > RightFoot > RightToeBase
```
Hair chains under `Hair_Root`: `Hair_Fringe_A/B/C_1..4`, `Hair_Side_L/R_1..4`, `Hair_Back_L/C/R_1..4`, `Hair_Top_1..4` (head-parented, so hair follows the head and the chains give secondary motion if an engine simulates them). Positions are in `skeleton.json` (55 body bones) and the .blend (hair bones, v1 positions + DZ).
- Root: `Hips` (no extra `Root` bone; add one above `Hips` in the engine if root motion is needed). Left = +X.
- Rest pose A-pose. Joint positions (world): Hips (0,0.004,0.925); Neck (0,0.012,1.41); Head (0,-0.004,1.523); LeftArm (0.159,0.009,1.36); LeftForeArm (0.340,0.009,1.101); LeftHand (0.486,-0.024,0.896); hips (+-0.085,0,0.915); knees (+-0.099,-0.004,0.495); ankles (+-0.108,0.003,0.078); toe base (+-0.121,-0.104,0.026). Knees and elbows have a small built-in bend toward the front (IK pole direction); `LeftLeg/RightLeg` and `LeftForeArm/RightForeArm` carry IK limits (X only, 0..150 deg) in the .blend.
- Bone roll (local Y = along the bone; local Z shown): Hips, spine, neck, head, jaw, shoulders, arms, forearms, up legs, legs: Z toward the front (-Y world), so local X bends forward/backward. Feet, toes, eyes: Z up. Hands and all finger bones: Z = palm normal (`hand_axes_*.palmar` in `landmarks.json`), so **positive local X rotation closes the fingers** on both hands. Connected chains (`use_connect`): spine, neck/head, shoulder/arm/forearm, legs, foot/toe.
- glTF: bone nodes keep these names; skinned meshes are children of the `Jurek.Rig` node (identity), joints = the 92 bones.

## 4. Weights and skinning rules
Body weights: Blender heat-map automatic weights on the 52 non-face bones, then Laplacian smoothing (6 passes, strength up to 0.9 at the joints shoulder, elbow, wrist, hip, knee, ankle, neck, spine), limited to 4 influences and normalised; the top of the neck takes the Head mesh weights (nearest vertex, smoothstep z 1.445..1.475) so Body and Head deform identically at the join. Checked by posing (arm raised 125 deg, arms forward, sitting 90/100 deg, twist, bend, run and walk cycles): no candy-wrapper collapse, mild volume loss at the inner elbow and groin at extreme flexion (see REPORT).
Head weights: v1 groups renamed `neck`->`Neck`, `head`->`Head`, `jaw`->`Jaw` (v1 `root` merged into `Neck`); face/eye-region groups from v1 are kept in the cinematic blend (not bones, used by v1 tools). Eyes: bone parenting. Hair: `Hair_*` groups as in v1.
**Garments** (see 5): mesh skinned with an Armature modifier on `Jurek.Rig`, vertex groups named exactly like deform bones, at most 4 influences per vertex (glTF JOINTS_0), weights sum to 1. Easiest recipe: copy weights from `Body` with a Data Transfer modifier (vertex data, nearest face interpolated, vertex groups by name), then add per-garment smoothing; sleeves and legs follow the limb bones, hoods/collars the `Neck`/`Head`, bags and straps `Spine2`, shoes `LeftFoot/LeftToeBase`. Hair or accessories that must follow the head only: weight 1.0 to `Head`. Export to glTF with the same armature in the file or rebind by bone name in three.js: `garment.bind(body.skeleton)` after cloning bones by name (`SkeletonUtils` or manual `bones.map(b => body.getObjectByName(b.name))`). Do not add or rename bones. Extra non-deforming bones are allowed with the prefix `Cloth_`.

## 5. Body surface set
`textures/body_baseColor_2048.png` (sRGB), `body_normal_2048.png` (glTF/OpenGL, +Y up), `body_orm_2048.png` (R occlusion, G roughness, B metallic), `body_sssThickness_2048.png` (cinematic only). Material `JurekBodySkin` is Principled (random-walk SSS 0.45, radius 1/0.35/0.2 like the head), glTF-compatible (`glTF Material Output` group carries occlusion).

## 6. Garment contract
Each garment is a mesh object, 6-20k tris, skinned (Armature modifier on the shared skeleton, vertex groups = bone names), PBR textures 2K (1K small items), UV set `UVMap`, plus a cinematic material in the `.blend` if useful. Custom properties on the object (and glTF `extras`):
| Property | Values |
|---|---|
| `slot` | `head` `glasses` `top_under` `top_over` `outer` `bottom` `shoes` `back` (`socks`/`gloves` allowed later) |
| `layer` | integer draw/collision order, higher is outside: `top_under` 10, `top_over` 20, `outer` 30, `bottom` 15, `shoes` 25, `head` 40, `glasses` 45, `back` 35 |
| `body_mask` | comma list of regions to hide on the body under the garment: `torso, arms, forearms, hands, thighs, shins, legs (= thighs+shins), feet, neck` |
| `hides_hair` | `true`, `false` or `partial` (hood, beanie, cap) |
| `item_id`, `title` | slug and display name |
Exclusive slots: one item per slot, except `top_under` + `top_over` + `outer` which stack. The editor hides body regions with the `_REGION` attribute (discard in the shader) or the `mask_*` vertex groups (Blender), and pushes nothing in geometry: garments are modelled **offset from the body surface by at least 3 mm** (tight clothes), more for loose ones. Body shape for fitting: use `Body` as the collision/shrinkwrap target; never edit it.

## 7. Hair attachment
Hair root bone `Hair_Root` is a child of `Head` (head 0,0.01,0.03 in head frame). Strand/card meshes are skinned to `Hair_Root` and the chain bones; curves hair in Blender is bone-parented to `Head`. A garment with `hides_hair = true` hides `Hair.*` meshes; `partial` (hood, beanie, cap) keeps the hair but the editor may swap to a short-hair variant or push the hair meshes with the `Hair_*` bones (hair bones are poseable, rotate `Hair_Side_*`, `Hair_Back_*` outward by a few degrees to clear a hood).

## 8. Animation clips (glTF animations / Blender NLA tracks, 30 fps, in place, Hips drives the height)
`A_pose`, `T_pose` (1 frame poses), `idle` (4 s loop, breathing, weight shift, double blink), `walk` (32 frames, about 1.4 m/s), `run` (22 frames, about 3 m/s, with flight phase), `turn_left`, `turn_right` (2.2 s, 90 degrees, head leads, feet shuffle), `wave` (3.2 s, right hand, smile), and additive layers `layer_blink` (shape keys `eyeBlinkLeft/Right` + `corr_eyeBlinkArc*`), `layer_look` (`eyeLook*` shape keys), `layer_headturn` (`Neck`, `Head` yaw/pitch). Loop clips repeat their first frame as the last key. Bone tracks key local quaternions relative to the rest pose (identity = A-pose), Hips also keys translation. Layers: use `AnimationUtils.makeClipAdditive` (three.js) or weight them on top. Because glTF shape-key tracks are per mesh, blink/look tracks target `Head`, `Lashes`, brows and `Eye.*` by node name.

## 9. Re-run
`Build/body/rig/run_all.sh` rebuilds rig, weights, neck textures, realtime scene, clips and exports from `body_fitted.blend`; `run_from2.sh` skips the stage-1 heat weights. `render_full.py` renders the cinematic scene, `pose_test.py` renders Workbench weight tests, `clips.py` holds all clip definitions. Body mesh itself: `build_body.py` etc. as before (`run_all.sh` in `Build/body`).

## 10. Extensions and polish notes (full-v1 polish pass)
- **Extra `Cloth_*` bones are part of the contract.** A garment GLB may carry additional bones named `Cloth_*` (hoods: `Cloth_Hood_Base/Mid/Top`, croc straps: `Cloth_CrocsStrap_L/R`, cords). They are parented to a named body bone in the garment file (the GLB node hierarchy says which). A loader must (1) rebind all bones whose name exists in the 92-bone body skeleton to the body's bone objects, (2) keep every `Cloth_*` bone, re-parent it under the body bone that is its parent in the garment file, and (3) play the garment's own clips (`hood_up`, `hood_down`, `cord_sway`, `strap_swing`) only on those bones. The editor does exactly this (`loadRuntime` in `editor/main.js`). The 92 body bones, their names and inverse bind matrices are identical in every file (checked, max difference 1e-5).
- Garment GLBs no longer carry body clips (`idle`, `walk`, ...). `A_pose` and `T_pose` in `character_nude.glb` are 2-key static poses, not motion.
- `character_nude_mobile.glb` is the same scene with textures capped at 1024 px (eyes 512): same bones, same morph targets, same hair (hair LOD is not reduced).
- Polish pass on the Body (topology, UVs, vertex order, skeleton and all bone positions unchanged, so every garment still fits): trapezius lifted up to 15 mm and a smoothed neck-to-shoulder transition, 2 mm clavicle relief, hips about 4 percent narrower, upper thigh slimmer (to 0.89 of the old radius at 0.70 m), body skin more saturated with mottling and a wider (9 cm) blend into the head neck texture, roughness matched to the head, run and walk toe-off capped at 25 and 22 degrees.
