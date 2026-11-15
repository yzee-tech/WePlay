// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

// portal.js is a plain browser script; the GAMES list is data, so parse the
// entries out of the source instead of executing it (no DOM in Node).
const src = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const games = [...src.matchAll(/\{\s*id:\s*'([^']+)',\s*title:\s*'([^']+)',\s*tagline:\s*'([^']+)'([^}]*)\}/g)]
  .map((m) => {
    const rest = m[4];
    const get = (k) => { const r = rest.match(new RegExp(k + ":\\s*'([^']+)'")); return r && r[1]; };
    return { id: m[1], title: m[2], tagline: m[3], path: get('path'), status: get('status'), art: get('art') };
  });

test('portal GAMES list parses and is non-empty', () => {
  assert.ok(games.length >= 3, `expected at least 3 entries, parsed ${games.length}`);
  for (const g of games) {
    assert.ok(g.title.length > 0);
    assert.ok(g.tagline.length > 0);
    assert.ok(g.status === 'play' || g.status === 'soon');
  }
});

test('every playable portal entry links to a real game folder with card art', () => {
  const playable = games.filter((g) => g.status === 'play');
  assert.ok(playable.length >= 2);
  for (const g of playable) {
    assert.ok(g.path && g.path.startsWith('./'), `${g.id} needs a path`);
    assert.ok(existsSync(new URL('../' + g.path.replace('./', '') + 'index.html', import.meta.url)), `${g.id}: ${g.path}index.html missing`);
    assert.ok(g.art, `${g.id} needs card art`);
    assert.ok(existsSync(new URL('../' + g.art, import.meta.url)), `${g.id}: ${g.art} missing`);
  }
});

test('Stickman Battle: Gunwars has a playable portal card', () => {
  const g = games.find((e) => e.id === 'stickman-gunwars');
  assert.ok(g, 'no stickman-gunwars entry in portal GAMES');
  assert.equal(g.status, 'play');
  assert.equal(g.path, './stickman-gunwars/');
});

// Short-landscape layout: guard that the compact phone-sideways rules exist and
// are scoped by a height query, so desktop and normal screens keep their layout.
const css = readFileSync(new URL('../portal.css', import.meta.url), 'utf8');
const shortBlock = css.match(/@media \(max-height: 500px\) and \(orientation: landscape\) \{([\s\S]*?)\n\}/);

test('portal has a short-landscape media query for phones held sideways', () => {
  assert.ok(shortBlock, 'missing @media (max-height: 500px) and (orientation: landscape)');
  const body = shortBlock[1];
  assert.match(body, /\.card\s*\{[^}]*height:\s*2\d\dpx/);
  assert.match(body, /\.stage\s*\{[^}]*height:\s*2\d\dpx/);
  assert.match(body, /\.site-footer\s*\{[^}]*display:\s*none/);
});

test('short-landscape rules stay out of the base styles', () => {
  const base = css.slice(0, css.indexOf('/* Short landscape screens'));
  assert.match(base, /\.stage \{[^}]*height: 400px/);
  assert.match(base, /\.card \{[^}]*height: 350px/);
  assert.doesNotMatch(base, /\.site-footer \{[^}]*display:\s*none/);
});
