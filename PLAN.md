# Air Defense: Plan (revision 2, implemented)

Revision 2 applies the review from Instinct (9 points) to the original plan, and records what was built.

## Decisions
- JavaScript + Three.js, orthographic side-on camera, no build step.
- Mouse aim, click to fire, desktop only. Turret has health (100); game over at 0.
- Sound in v1, synthesised with the Web Audio API (no audio files).
- Planes drop bombs (no kamikaze). Snake game removed.

## Changes from review (revision 2)
| # | Review point | Resolution |
|---|---|---|
| 1 | Vendoring was wrong: minified Three.js is split into two files | Pinned **three@0.185.0**; vendored **both** `three.module.min.js` and `three.core.min.js` in `vendor/` (verified both exist in the package and the module file imports `./three.core.min.js`). Import map maps `three` to `./vendor/three.module.min.js`. Versions and license in `vendor/`. |
| 2 | Workflow published the whole repo | Workflow now runs the Node tests, copies only `index.html`, `style.css`, `src/`, `vendor/` into `_site`, and uploads `_site`. Done in milestone 1. |
| 3 | Bomb cadence undefined | Config: fighter max 1 bomb per pass, bomber max 3; at least 0.8 s between drops. Planes drop only when the predicted landing point is within a tolerance of the turret (fighter 1.5, bomber 5 world units), plus a random aim error of up to 1 unit. |
| 4 | Bomb velocity undefined | Bombs inherit the plane's horizontal velocity and fall under gravity (12 u/s^2). |
| 5 | Can bombs be shot down? | Yes. A missile contact or blast destroys a bomb mid-air; scores 25 points. |
| 6 | Wave end undefined | A wave ends when its spawn list is exhausted and no planes remain on screen (planes that fly off are removed). Letting planes leave cannot stall a wave. |
| 7 | localStorage key | `airdefense.highscore` and `airdefense.muted`; no Snake key reused. |
| 8 | Old browsers get a blank page | Import-map feature detect in `index.html` plus a WebGL check in `main.js`, both show a readable message. |
| 9 | Pages cache | Noted in README: hard-refresh after deploy. |

## File layout (as built)
```
index.html, style.css          page shell, HUD, overlays, import map
src/config.js                  all tunable numbers
src/game.js                    pure rules: waves, bombs, missiles, scoring, health (no Three.js, no DOM)
src/render.js                  Three.js scene, orthographic camera, meshes (pooled), pointer-to-world
src/effects.js                 particle pool (cap 400): explosions, smoke
src/audio.js                   synthesised sound, mute, alarm
src/hud.js                     DOM HUD and screens
src/main.js                    loop (fixed 60 Hz, 100 ms clamp), input, state: start / playing / paused / over
tests/game.test.mjs            Node tests of the rules (15)
vendor/                        three@0.185.0 (two files) + license
.github/workflows/pages.yml    tests, assemble _site, deploy
```
Note: separate `turret.js`, `planes.js`, `missiles.js` from the first plan were folded into `game.js` (rules) and `render.js` (meshes) so the rules stay testable without Three.js.

## Rules (values in `src/config.js`)
- Turret: 100 health, hit radius 1.7, fire cooldown 0.35 s, barrel limited to 5 to 175 degrees. Cursor below the horizon keeps the barrel on its side at the lowest angle.
- Missile: speed 30, explodes on contact with a plane or bomb, otherwise at the clicked point; blast radius 2.4 damages planes by 1 and destroys bombs. Destroyed planes cause a smaller chain blast (radius 1.6), at most 5 per detonation.
- Fighter: speed 7, 1 hit, 100 points, small bomb (10 damage). Bomber: speed 4.5, 2 hits, 250 points, large bomb (15 damage).
- Wave n: 4 + 2n planes; spawn interval 2.0 - 0.12n (min 0.5 s); speed +5% per wave; bomber chance 10% per wave after wave 1 (max 50%). Banner on each wave.
- High score and mute are saved in localStorage inside try/catch.
- Sound: launch, explosion, bomb hit, low-health alarm (under 30%), game over; per-sound rate limits and at most 6 concurrent explosions.

## Verification done
- `node --test tests/game.test.mjs`: 15 of 15 pass (a test caught and fixed a barrel-snapping bug when aiming below the horizon on the left side).
- Headless Chromium served from a `/WePlay/` subpath: loads with no 404s or script errors; played to wave 3; pause, game over and restart work.
- Not verified: real audio output (headless), touch devices, Safari, the live GitHub Pages deployment (needs merge to `main` and Pages enabled).

## Remaining steps for the user
1. Review the branch and play it locally (`python3 -m http.server`).
2. Merge to `main`; enable Settings > Pages > Source: GitHub Actions.
3. Tune difficulty numbers in `src/config.js` after playing.

## Out of scope for v1
Touch controls, 3D models and perspective camera, multiplayer, power-ups, more plane types, music, leaderboards, mobile layout.
