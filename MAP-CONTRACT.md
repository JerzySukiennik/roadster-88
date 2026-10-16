# Roadster 88: Part 2 map contract (web only)

Jurek's decisions (2026-10-16): Part 2 is built **only in the web build** (`web/`, three.js WebGPU + Rapier). The map is **one invented, procedural Californian valley, about 4 x 4 km**, shaped for fun (natural ramps, canyons, a mesa, a dry wash, long straights for 250 mph, room to fly). It exists in **7 eras** (CONTRACT.md section 7: `hadean`, `dino`, `1885`, `2026`, `2080`, `ruins`, `scifi`). The past affects the future (systemic changes plus scripted turning points). Pure sandbox, no story. Godot stays at Part 1.

Two agents build it in parallel in the same checkout. Read SPEC.md, CONTRACT.md, `web/` (especially `src/main.js`, `src/sim/layout.js`, `src/sim/world.js`, `src/render/plate.js`, `src/render/sky.js`, `src/sim/timetravel.js`) and `~/.claude/project-notes/roadster-88.md` first.

## 1. Frame, scale, performance
- Metres, +Y up, the same world frame as Part 1. Valley centre at the origin, playable square x, z in [-2000, 2000], with mountains past the edge as a backdrop (not drivable, no collision needed beyond a soft boundary).
- Valley floor near y = 0, ridges 250 to 450 m.
- Targets: Intel MacBook Pro 2019 at 60 fps on the High preset, iPhone XR Safari on Low. Use instancing, chunked LOD and impostors. As a rough budget, stay under about 300 draw calls and 1.5 M visible triangles. Measure with `node web/tools/harness.mjs` (add scenarios) and report the numbers.
- The grey test plate must keep working: `?map=plate` loads Part 1 exactly as today. The valley becomes the default only when it is solid.

## 2. Agent A: valley (terrain owner)
Owns `web/src/world/**` (new), the map choice and loading in `web/src/main.js`, `web/src/sim/world.js` (physics for the valley), the cockpit Map app drawing (`drawMap` in `web/src/render/cockpit.js`), and a `valley` scenario in `web/tools/harness.mjs`.

Delivers `web/src/world/valley.js`:
```js
export async function createValley(game) // returns the object below; adds meshes to game.gfx.scene and colliders to game.phys.world
{
  size: 4000,
  heightAt(x, z),            // pure JS, deterministic, base terrain for the current era
  normalAt(x, z, out),
  surfaceAt(x, z),           // 'asphalt' | 'dirt' | 'sand' | 'grass' | 'rock' | 'water' | 'lava' ... (grip and fx hints)
  spawn: { pos: [x, y, z], yaw },
  safeSpawnAt(x, z, y),      // nearest free spot at or above y, used after a time jump
  regions,                   // named areas: [{ id, name, poly: [[x, z], ...] }] (town, mesa, canyon, wash, lake, ...)
  setEraTerrain(eraId),      // optional small terrain deltas per era (lava field, full lake). Rebuilds the affected chunks and colliders
  update(dt, camPos),        // LOD and streaming
}
```
Agent A builds the base valley in a neutral look (rock, dirt, dry grass, roads as a 2026 baseline) plus the terrain shader hooks Agent B needs (section 4).

## 3. Agent B: eras (era owner)
Owns `web/src/eras/**` (new), era presets in `web/src/render/sky.js` (sun, sky, fog and exposure per era), and an `eras` scenario in `web/tools/harness.mjs`.

Delivers `web/src/eras/eras.js`:
```js
export class EraSystem {
  constructor(game, valley)
  apply(eraId, { instant })  // swap the terrain materials or palette, sky, fog, props, structures, ambient; calls valley.setEraTerrain(eraId)
  update(dt, camPos)
  worldState                 // causality: persistent changes keyed by place and era, e.g. destroyed or moved props, which later eras read
}
```
Per era: a terrain palette (via the hooks in section 4), sky and fog, instanced vegetation and props, structures with colliders (1885 town and railway, 2026 town and highway, 2080 future town, ruins, sci-fi), and an ambient key. The radio already plays `music_<era>`. Hadean is lava, rock and a red sky. Dino is ferns, cycads and a full lake, with no animated dinosaurs yet (static silhouettes in the distance at most). Causality: start with the systemic part (something destroyed in an earlier era stays gone or turns into ruins in later eras) and leave a clean hook for turning points.

## 4. Seams between A and B
- **Terrain material hooks** (A provides): a terrain material that blends up to 6 layers by slope, height and region masks, with layer textures and tints set through a single `valley.setPalette(palette)` call. B defines the palettes.
- **Props** (B owns): B places its own instanced meshes and colliders using `valley.heightAt`, `valley.normalAt` and `valley.regions`. A keeps roads and the main landforms; B decorates.
- **Time-jump arrival** (A wires it in `main.js`): on the `arrive` event, call `game.eras.apply(eraOf(year).id)`, then `valley.safeSpawnAt` if the car would land inside terrain or a structure. While B's module does not exist yet, A guards the call with a dynamic import.
- Neither agent edits the car, sim, effects, camera or audio files (`web/src/sim/car.js`, `thrusters.js`, `allocator.js`, `flight.js`, `web/src/render/carView.js`, `fx.js`, `camera.js`, `audio.js`, `damage.js`). The lead session owns them. If you need a change there, write it under Requests below and tell the lead session.
- If you need an API change from the other agent, write it under Requests, and keep your code working against the current API.

## 5. Rules
- Code, comments and docs in English. No comments in final code except a short header per file. Write whole files. Follow the existing code style (pure-JS sim, TSL materials, `fxMaterial` for transparent effects).
- Assets: first `~/Downloads/Claude/assets`, then Kenney.nl (CC0), Poly Haven (CC0 textures and HDRIs), then procedural. Log every third-party file in `CREDITS.md`. Use no human models.
- Test on real runs: the dev server is already running on http://localhost:8788 (`web/serve.mjs`). Jurek may be playing on it, so never kill it. Use `node web/tools/harness.mjs <scenario>` for screenshots and frame times, and save shots to `Niepotrzebne/shots-map/`. Look at your screenshots before you call anything done.
- **No git commits and no deploys.** The lead session commits. Deploys happen only on Jurek's command.
- When you finish a milestone, add a short line under Status below.

## Status
- (A) ...
- (B) ...

## Requests
- ...
