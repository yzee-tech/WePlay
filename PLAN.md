# Air Defense: Implementation Plan (for review)

Status: DRAFT, awaiting approval. No game code has been written for this plan.
Reviewer: please check the plan against the "Review checklist" at the end and report problems, gaps and unsafe assumptions. Do not implement anything.

## 1. Goal
A browser game called **Air Defense**. A ground missile turret shoots down attacking airplanes. It is hosted as a static site on GitHub Pages from the repo `yzee-tech/WePlay`.

## 2. Decisions already made by the user
| Topic | Decision |
|---|---|
| Language / tech | JavaScript with Three.js (WebGL) |
| Camera | Orthographic, side-on view (flat, like a 2D arcade shooter); 3D-ready for later |
| Controls | Mouse only: aim at cursor, click to fire |
| Loss rule | The turret has health; game over at 0 |
| Sound | Required in version 1 |
| Existing code | Remove the Snake game (`index.html`, `style.css`, `game.js`, `README.md` content) |
| Process | Discuss and approve the plan before writing code |

## 3. Assumptions (not yet confirmed by the user)
1. Planes attack by **dropping bombs** on the turret (alternative: kamikaze dives).
2. Work is committed to branch `claude/relaxed-feynman-5klt02`; merging to `main` is left to the user.
3. Desktop browsers only for version 1; touch support is out of scope.
4. Sound is **synthesised in code** (Web Audio API), with no audio files.
5. Three.js is **vendored** into the repo (no CDN at runtime).
6. No build step, no npm at runtime.

## 4. Hosting constraints (GitHub Pages)
- Static files only; no server code.
- Site and repo should stay well under 1 GB; this game is a few hundred KB.
- Pages must be enabled by the user in Settings, Pages, Source: GitHub Actions. The existing workflow `.github/workflows/pages.yml` deploys on push to `main`. It currently uploads the whole repo root, including `PLAN.md`; decide whether to publish only a `docs/` or `public/` folder instead.
- Paths must be relative, because the site is served from `/WePlay/`, not `/`.
- ES modules require HTTP, so `file://` will not work; document `python3 -m http.server`.

## 5. Technical design

### 5.1 File layout
```
index.html            page shell, canvas container, start/game-over overlays
style.css             overlay + HUD styles
src/main.js           bootstraps renderer, scene, camera, loop
src/game.js           state machine, waves, scoring, health, high score
src/turret.js         turret mesh, aim, fire cooldown
src/planes.js         plane meshes, spawning, movement, bomb dropping
src/missiles.js       missile meshes, movement, trails
src/effects.js        explosion particles, smoke, screen shake
src/audio.js          Web Audio synth: fire, explosion, bomb hit, alarm, game over; mute
src/hud.js            health bar, wave, score, mute button (DOM overlay)
vendor/three.module.min.js   pinned Three.js build (version recorded in vendor/README)
```

### 5.2 Rendering
- `THREE.WebGLRenderer`, `OrthographicCamera` with fixed world height (e.g. 18 units); width scales with aspect ratio. Handle resize and `devicePixelRatio` (cap at 2).
- Scene: gradient sky (background plane or CSS), distant hills, ground strip, turret.
- Low-poly primitives and simple shapes built from geometry in code. Basic lighting (ambient + one directional).
- World uses x (horizontal), y (vertical), z (depth, small; used for layering only in v1).

### 5.3 Game loop
- `requestAnimationFrame`, fixed-timestep simulation (e.g. 60 Hz) with accumulator, so physics does not depend on frame rate.
- Clamp the frame delta (e.g. 100 ms) so a background tab does not cause a huge jump on return.
- Pause when the tab is hidden (`visibilitychange`) and on key `P` / `Esc`.

### 5.4 Input
- `pointermove` on the canvas converts screen coordinates to world coordinates through the camera; the turret barrel rotates toward the cursor, clamped to the upper half (angle between 5 and 175 degrees).
- `pointerdown` fires a missile if the cooldown has elapsed (e.g. 0.35 s). Missile flies toward the aim point, in a straight line at constant speed.
- Optional: missile detonates at the clicked point or on contact with a plane (decide in review; default: contact, plus detonate at the clicked point with a small blast radius).

### 5.5 Gameplay rules (initial numbers, to be tuned)
- Turret health: 100. Bomb hit: 10 to 15 damage depending on bomb size. Plane that reaches the turret column and passes it: no extra damage.
- Plane types in v1: **fighter** (fast, 1 hit, 100 points) and **bomber** (slow, 2 hits, 250 points, bigger bombs). Others later.
- Planes enter from the left or right edge at random altitudes in the upper 60% of the screen, fly across, drop bombs when within a horizontal range of the turret, and leave the other side (and despawn).
- Waves: wave n spawns `4 + 2n` planes over time, spawn interval shrinks with n, speed increases about 5% per wave, bomber chance rises with n. A short pause and "WAVE n" banner between waves.
- Bombs: fall with gravity; damage the turret if they land within its hit radius; otherwise explode on the ground harmlessly.
- Explosions: radial particle burst, short light flash, a small blast radius that can kill adjacent planes (chain reactions allowed, capped).
- Score persisted: high score in `localStorage` wrapped in try/catch (may be unavailable).

### 5.6 State machine
`LOADING -> START (click to start, unlocks audio) -> PLAYING <-> PAUSED -> GAME_OVER -> PLAYING (restart)`.

### 5.7 Audio
- One `AudioContext` created or resumed on the first user click on the START screen (browser autoplay policy).
- Sounds are generated from oscillators and noise buffers: missile launch (filtered noise whoosh), explosion (noise burst with low-pass sweep), bomb hit on the turret (low thud), low-health alarm (looping beep under 30% health), game over (descending tone).
- Master gain and mute toggle (persisted); sound effects are rate limited to avoid clipping during chain explosions.

### 5.8 HUD and UI
- DOM overlay (not canvas): health bar (top left), wave and score (top right), mute button (bottom right), centered overlays for start, pause and game over, with final score and high score and a restart button.
- Must be keyboard accessible where practical (buttons are real `<button>` elements).

### 5.9 Performance and robustness
- Reuse geometries and materials; pool missiles, planes, bombs and particles instead of allocating per frame.
- Cap simultaneous particles. Target 60 fps on a mid-range laptop.
- Dispose of resources on restart. No memory growth across repeated games.
- Handle WebGL not being available with a readable message.

## 6. Milestones and acceptance criteria
Each milestone ends with a commit on the working branch and a stop for user review.

1. **Setup**
   - Remove Snake files. Add the vendored Three.js and the file skeleton.
   - Scene renders: sky, ground, turret. Turret barrel follows the mouse within limits. Window resize works.
   - Accept: opens with a local server, no console errors, correct at several window sizes.
2. **Missiles and firing sound**
   - Click fires missiles with cooldown, smoke trail, despawn when off-screen. Start overlay unlocks audio.
   - Accept: rapid clicking respects cooldown; sound plays on fire only after the first click; no errors.
3. **Planes and explosions**
   - Fighters spawn and cross the screen; collisions with missiles kill them with explosion, score and sound.
   - Accept: hit detection feels correct at edges; no ghost objects remain after kills.
4. **Waves, bombs, health, game over**
   - Bombers, bombs, turret damage and health bar, waves with banners, game over and restart, high score, alarm sound.
   - Accept: a full game from wave 1 to game over, then restart, works repeatedly with no leaks or stuck state.
5. **Polish and deploy**
   - Pause, mute, tab-hidden pause, tuning of difficulty, README with instructions, workflow reviewed.
   - Accept: playable for 10+ minutes without slowdown; Pages deployment verified after the user enables it.

## 7. Testing plan
- Manual play-through in current Chrome and Firefox (desktop). Safari if available.
- Console clean in each milestone.
- Logic that can be tested without a browser (wave generation, scoring, collision functions) is kept free of Three.js so it can be unit-tested with plain Node if desired.
- Check at window sizes from 1024x600 up to ultrawide, and at browser zoom levels.
- Deployment check after merge: site loads from `https://yzee-tech.github.io/WePlay/` with relative paths and no 404s.

## 8. Risks
| Risk | Mitigation |
|---|---|
| Audio blocked by autoplay policy | Start overlay that requires a click before any sound |
| Wrong asset paths on Pages subpath | Use relative paths only; test under a subpath locally |
| Frame-rate dependent speed | Fixed timestep |
| Hit detection tunnelling at high speed | Swept (segment) tests for missiles |
| Difficulty unbalanced | Tunables kept in one config object; tune after milestone 4 |
| Vendored library size or license | Use the official minified build; keep the MIT license text in `vendor/` |
| Scope creep (3D models, touch, multiplayer) | Explicitly out of scope for v1 |

## 9. Out of scope for version 1
Touch controls, 3D models and perspective camera, multiplayer, power-ups, more than two plane types, music, leaderboards, mobile layout.

## 10. Review checklist (for the checking agent)
1. Does anything in sections 2 and 3 contradict itself or the milestones?
2. Is every milestone's acceptance criterion testable, and is the order sensible (nothing depends on later work)?
3. Are there GitHub Pages pitfalls missing (paths, MIME types for `.js` modules, workflow publishing unneeded files)?
4. Is the choice of vendoring Three.js with ES modules and no build step workable? Is the import map or relative import approach specified well enough?
5. Are the game rules (section 5.5) complete enough to implement without guessing? List every undefined behaviour.
6. Are there audio, input or resize edge cases not covered (tab switching, zero-size canvas, high-DPI, fast clicking)?
7. Is the performance plan realistic for the number of objects expected?
8. What is missing, over-engineered, or should be cut from version 1?
9. Which assumptions in section 3 are the riskiest, and what should the user be asked?
