# WePlay

A portal of small browser games. Plain HTML/CSS/JavaScript, no build step.

The root page is the portal: a game-select carousel rendered from a data list
in `portal.js`. Adding a game means adding one entry there.

## Games
- **Air Defense** (`air-defense/`) a ground missile turret shoots down attacking
  planes. Three.js (orthographic side-on camera), plain ES modules.
  Controls: move the mouse to aim, click to fire, `P` or `Esc` to pause.
- **Alien Invasion** (`alien-invasion/`) a typing tutor disguised as a shooter. Alien
  ships carry words; type a word to destroy its ship before it lands. Plain 2D canvas
  (no Three.js), plain ES modules. Two modes: **Invasion** (endless waves, boss
  sentence every 5th wave) and **Training** (7 lessons from the home row to capitals
  and numbers; 3 waves each, 90% accuracy unlocks the next). `Esc` or the II button
  pauses. Works with a physical keyboard or a phone soft keyboard (hidden text field).
  Add `?env=night:city` (theme:landscape) to pin the scenery, `?debug=1` for a test hook.

## Run locally
ES modules need HTTP (not `file://`):

```bash
python3 -m http.server 8000
```

Open http://localhost:8000 for the portal, http://localhost:8000/air-defense/
for the game directly.

## Tests
Game rules live in `air-defense/src/game.js` with no Three.js or DOM, so they
run in plain Node:

```bash
node --test tests/game.test.mjs tests/scenery.test.mjs tests/typing.test.mjs
```

`tests/typing.test.mjs` covers Alien Invasion (rules, words, lessons, stats, input
decoding) and checks the Pages workflow publishes the new folders.

## Layout
- `index.html`, `portal.css`, `portal.js` portal page and carousel
- `assets/` portal artwork (background, card art)
- `air-defense/` the Air Defense game (page shell, HUD, overlays, import map, `src/`)
- `air-defense/src/config.js` all tunable numbers
- `air-defense/src/game.js` rules (waves, bombs, scoring, health)
- `air-defense/src/render.js`, `effects.js` Three.js scene and particles
- `air-defense/src/audio.js` synthesised sound, `hud.js` DOM overlay, `main.js` loop and input
- `alien-invasion/` the Alien Invasion game (`src/`: `game.js` rules, `words.js` + `wordlist.js`
  our own word list and lessons, `stats.js` WPM/accuracy/saved progress, `input.js` keyboard and
  soft-keyboard decoding, `render.js` canvas drawing, `config.js` tunables)
- `shared/scenery.js` day/sunset/night themes and landscapes, used by both games (pure data)
- `vendor/` pinned Three.js 0.185.0, shared by all games (both files are required, see `vendor/README.md`)

## Hosting on GitHub Pages
1. Merge to `main`.
2. Settings > Pages > Source: **GitHub Actions** (once).
3. The workflow runs the tests, copies the portal, games, `assets/` and
   `vendor/` into `_site`, and deploys to `https://<user>.github.io/WePlay/`.
   Pages caches for about 10 minutes, so hard-refresh after a deploy.
