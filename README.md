# Air Defense

A ground missile turret shoots down attacking planes. Built with Three.js (orthographic side-on camera), plain ES modules, no build step.

**Controls:** move the mouse to aim, click to fire, `P` or `Esc` to pause. Shoot planes and their bombs; the game ends when the turret's health reaches 0.

## Run locally
ES modules need HTTP (not `file://`):

```bash
python3 -m http.server 8000
```

Open http://localhost:8000.

## Tests
Game rules live in `src/game.js` with no Three.js or DOM, so they run in plain Node:

```bash
node --test tests/game.test.mjs
```

## Layout
- `src/config.js` all tunable numbers
- `src/game.js` rules (waves, bombs, scoring, health)
- `src/render.js`, `src/effects.js` Three.js scene and particles
- `src/audio.js` synthesised sound, `src/hud.js` DOM overlay, `src/main.js` loop and input
- `vendor/` pinned Three.js 0.185.0 (both files are required, see `vendor/README.md`)

## Hosting on GitHub Pages
1. Merge to `main`.
2. Settings > Pages > Source: **GitHub Actions** (once).
3. The workflow runs the tests, copies only the game files into `_site`, and deploys to `https://<user>.github.io/WePlay/`. Pages caches for about 10 minutes, so hard-refresh after a deploy.
