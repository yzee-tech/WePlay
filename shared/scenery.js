// Scenery themes, landscape data and per-game environment selection.
// No Three.js, no DOM: pure data and pure functions, so node tests can
// validate everything render.js will draw. Nothing here touches game rules,
// and pickEnvironment uses only the rng passed in (Math.random by default),
// never the gameplay rng in game.js.

export const THEME_KEYS = ['day', 'sunset', 'night'];
export const LANDSCAPE_KEYS = ['city', 'mountains', 'sea', 'desert'];

// Each theme defines every scenery tone, so any landscape can render in any
// theme. Tones: far/near (silhouette layers), ground/groundTop, water, sand,
// snow, window (lit windows at sunset/night).
export const THEMES = {
  day: {
    sky: [0x2a63b8, 0x659fd6, 0xcfe6f5], // top, mid, horizon - bright daytime blue
    tones: {
      far: 0x1c3a52, near: 0x25503f, ground: 0x2f5a38, groundTop: 0x3f7a47,
      water: 0x3f6f9e, sand: 0xd8c28a, snow: 0xf2f6f8, window: 0x2b3642, structure: 0x1a3040,
    },
    cloud: { color: 0xffffff, opacity: 0.5 },
    ambient: { color: 0xffffff, intensity: 1.0 },
    sun: { color: 0xfff2d8, intensity: 2.2, position: [-10, 20, 20] },
    stars: false,
    disc: { color: 0xffd23e, x: -10, y: 12.5, z: -11, r: 1.1, glow: { color: 0xffdf6e, r: 2.0, opacity: 0.25 }, rays: { count: 12, length: 0.95, width: 0.22, color: 0xffd23e } }, // flat-art sun with rays
    windowsLit: false,
    bombColor: null, // null keeps the gameplay default
  },
  sunset: {
    sky: [0x2a1b3d, 0xb3502e, 0xffb257],
    tones: {
      far: 0x4a2b4a, near: 0x3d2f45, ground: 0x3a3f2e, groundTop: 0x555f36,
      water: 0x8a5468, sand: 0xc99a6a, snow: 0xf6d9c8, window: 0xffca7a, structure: 0x3a2438,
    },
    cloud: { color: 0xffd9c0, opacity: 0.55 },
    ambient: { color: 0xffd9b8, intensity: 0.75 },
    sun: { color: 0xff9a4d, intensity: 1.8, position: [-14, 6, 20] },
    stars: false,
    disc: { color: 0xffd27a, x: -11, y: 4.5, z: -11, r: 2.2, glow: { color: 0xffbe64, r: 4.2, opacity: 0.3 } }, // low sun
    windowsLit: true,
    bombColor: null,
  },
  night: {
    // Dark blue, never near-black: planes, bombs and the turret must stay readable.
    sky: [0x0a1830, 0x16305a, 0x2f5a8a],
    tones: {
      far: 0x14283f, near: 0x1b3a50, ground: 0x1a3232, groundTop: 0x234545,
      water: 0x22456e, sand: 0x6a6355, snow: 0xcfd8e8, window: 0xffca7a, structure: 0x101f30,
    },
    cloud: { color: 0x9db4d4, opacity: 0.4 },
    ambient: { color: 0x9db8e8, intensity: 0.65 },
    sun: { color: 0xbdd3ff, intensity: 1.2, position: [8, 18, 20] }, // moonlight
    stars: true,
    starCount: 180,
    disc: { color: 0xf4f1de, x: 9, y: 11.5, z: -11, r: 1.3, glow: { color: 0xdfe8ff, r: 2.2, opacity: 0.18 } }, // moon
    windowsLit: true,
    bombColor: 0x3d4450, // bombs are near-black by default; lift them at night
  },
};

// Landscape primitives, interpreted by render.js. Coordinates are world units:
// y = 0 is the ground surface, camera covers y -2..16 and about x -16..16.
// All z are negative so scenery always sits behind planes and the turret.
//   hill:  { kind, x, w, h, z, tone }            quadratic-curve silhouette
//   peak:  { kind, x, w, h, z, tone, snow }      triangle, optional snow cap
//   rect:  { kind, x, w, h, z, tone, windows }   building; windows light up when the theme says so
//   band:  { kind, y, h, z, tone, shimmer }      wide horizontal strip (water)
//   boat:  { kind, x, y, z, tone }               small sailboat silhouette
//   cactus:{ kind, x, z, tone, scale }           trunk + two arms
export const LANDSCAPES = {
  // Fallback look (the original hills); never picked randomly.
  hills: [
    { kind: 'hill', x: -53, w: 22, h: 3.2, z: -10, tone: 'far' },
    { kind: 'hill', x: -36, w: 22, h: 4.2, z: -10, tone: 'far' },
    { kind: 'hill', x: -22, w: 22, h: 5.2, z: -10, tone: 'far' },
    { kind: 'hill', x: -5, w: 22, h: 3.2, z: -10, tone: 'far' },
    { kind: 'hill', x: 11, w: 22, h: 4.2, z: -10, tone: 'far' },
    { kind: 'hill', x: 25, w: 22, h: 5.2, z: -10, tone: 'far' },
    { kind: 'hill', x: 42, w: 22, h: 3.2, z: -10, tone: 'far' },
    { kind: 'hill', x: 56, w: 22, h: 4.2, z: -10, tone: 'far' },
    { kind: 'hill', x: -48, w: 18, h: 1.8, z: -6, tone: 'near' },
    { kind: 'hill', x: -33, w: 18, h: 2.8, z: -6, tone: 'near' },
    { kind: 'hill', x: -18, w: 18, h: 1.8, z: -6, tone: 'near' },
    { kind: 'hill', x: -4, w: 18, h: 2.8, z: -6, tone: 'near' },
    { kind: 'hill', x: 7, w: 18, h: 1.8, z: -6, tone: 'near' },
    { kind: 'hill', x: 18, w: 18, h: 2.8, z: -6, tone: 'near' },
    { kind: 'hill', x: 29, w: 18, h: 1.8, z: -6, tone: 'near' },
    { kind: 'hill', x: 40, w: 18, h: 2.8, z: -6, tone: 'near' },
  ],
  city: [
    // Far skyline
    { kind: 'rect', x: -46, w: 7, h: 6.5, z: -10, tone: 'far' },
    { kind: 'rect', x: -37, w: 6, h: 4.5, z: -10, tone: 'far' },
    { kind: 'rect', x: -28, w: 8, h: 8, z: -10, tone: 'far' },
    { kind: 'rect', x: -17, w: 6, h: 5.5, z: -10, tone: 'far' },
    { kind: 'rect', x: -8, w: 7, h: 7, z: -10, tone: 'far' },
    { kind: 'rect', x: 1, w: 6, h: 4, z: -10, tone: 'far' },
    { kind: 'rect', x: 10, w: 8, h: 6, z: -10, tone: 'far' },
    { kind: 'rect', x: 21, w: 6, h: 8.5, z: -10, tone: 'far' },
    { kind: 'rect', x: 30, w: 7, h: 5, z: -10, tone: 'far' },
    { kind: 'rect', x: 40, w: 7, h: 7.5, z: -10, tone: 'far' },
    { kind: 'rect', x: 50, w: 6, h: 5.5, z: -10, tone: 'far' },
    // Near row, offset, with windows
    { kind: 'rect', x: -42, w: 8, h: 3.5, z: -6, tone: 'structure', windows: true },
    { kind: 'rect', x: -31, w: 7, h: 5, z: -6, tone: 'structure', windows: true },
    { kind: 'rect', x: -20, w: 8, h: 3, z: -6, tone: 'structure', windows: true },
    { kind: 'rect', x: -9, w: 7, h: 4.5, z: -6, tone: 'structure', windows: true },
    { kind: 'rect', x: 4, w: 9, h: 5.5, z: -6, tone: 'structure', windows: true },
    { kind: 'rect', x: 16, w: 7, h: 3.5, z: -6, tone: 'structure', windows: true },
    { kind: 'rect', x: 27, w: 8, h: 4.5, z: -6, tone: 'structure', windows: true },
    { kind: 'rect', x: 39, w: 7, h: 6, z: -6, tone: 'structure', windows: true },
    { kind: 'rect', x: 49, w: 6, h: 3.5, z: -6, tone: 'structure', windows: true },
  ],
  mountains: [
    { kind: 'peak', x: -44, w: 26, h: 9, z: -10, tone: 'far', snow: true },
    { kind: 'peak', x: -18, w: 30, h: 12, z: -10, tone: 'far', snow: true },
    { kind: 'peak', x: 10, w: 26, h: 8, z: -10, tone: 'far', snow: true },
    { kind: 'peak', x: 38, w: 30, h: 10.5, z: -10, tone: 'far', snow: true },
    { kind: 'hill', x: -30, w: 24, h: 3, z: -6, tone: 'near' },
    { kind: 'hill', x: -2, w: 26, h: 4, z: -6, tone: 'near' },
    { kind: 'hill', x: 26, w: 24, h: 3, z: -6, tone: 'near' },
  ],
  sea: [
    // Low distant headlands at the edges, open water in the middle.
    { kind: 'hill', x: -52, w: 22, h: 2.5, z: -10, tone: 'far' },
    { kind: 'hill', x: 52, w: 22, h: 2.5, z: -10, tone: 'far' },
    { kind: 'band', y: 0, h: 2.6, z: -6, tone: 'water', shimmer: true },
    { kind: 'boat', x: 11, y: 2.6, z: -6.2, tone: 'far' },
    { kind: 'boat', x: -12, y: 2.6, z: -9, tone: 'far' },
  ],
  desert: [
    { kind: 'hill', x: -44, w: 34, h: 3, z: -10, tone: 'sand' },
    { kind: 'hill', x: -6, w: 40, h: 4, z: -10, tone: 'sand' },
    { kind: 'hill', x: 36, w: 34, h: 3, z: -10, tone: 'sand' },
    { kind: 'hill', x: -26, w: 30, h: 1.6, z: -6, tone: 'sand' },
    { kind: 'hill', x: 14, w: 34, h: 2, z: -6, tone: 'sand' },
    { kind: 'cactus', x: -10, z: -3, tone: 'near', scale: 1 },
    { kind: 'cactus', x: 13, z: -3.5, tone: 'near', scale: 0.8 },
    { kind: 'cactus', x: 24, z: -4, tone: 'near', scale: 1.2 },
  ],
};

// Ground strip colors per landscape, resolved through theme tones.
const GROUND_TONES = {
  hills: ['ground', 'groundTop'],
  city: ['ground', 'groundTop'],
  mountains: ['ground', 'groundTop'],
  sea: ['sand', 'sand'],
  desert: ['sand', 'sand'],
};

// Default before the first pick; 'hills' keeps the pre-scenery look.
export const DEFAULT_ENV = { theme: 'day', landscape: 'hills' };

// One call draws both picks from the injected rng (Math.random by default),
// which is deliberately separate from the gameplay rng owned by Game.
export function pickEnvironment(rng = Math.random) {
  const theme = THEME_KEYS[Math.min(THEME_KEYS.length - 1, Math.floor(rng() * THEME_KEYS.length))];
  const landscape = LANDSCAPE_KEYS[Math.min(LANDSCAPE_KEYS.length - 1, Math.floor(rng() * LANDSCAPE_KEYS.length))];
  return { theme, landscape };
}

// Dev/verification override: '?env=night:city' pins the environment.
export function environmentFromString(value) {
  if (!value || typeof value !== 'string') return null;
  const [theme, landscape] = value.split(':');
  if (!THEME_KEYS.includes(theme) || !LANDSCAPE_KEYS.includes(landscape)) return null;
  return { theme, landscape };
}

// Flatten theme + landscape into everything render.js needs to draw the scene.
// Returns null for unknown keys.
export function resolveEnvironment(env) {
  if (!env) return null;
  const theme = THEMES[env.theme];
  const primitives = LANDSCAPES[env.landscape];
  const groundTones = GROUND_TONES[env.landscape];
  if (!theme || !primitives || !groundTones) return null;
  return {
    theme: env.theme,
    landscape: env.landscape,
    sky: theme.sky,
    tones: theme.tones,
    cloud: theme.cloud,
    ambient: theme.ambient,
    sun: theme.sun,
    stars: !!theme.stars,
    starCount: theme.starCount || 0,
    disc: theme.disc || null,
    windowsLit: !!theme.windowsLit,
    bombColor: theme.bombColor,
    groundTone: theme.tones[groundTones[0]],
    groundTopTone: theme.tones[groundTones[1]],
    primitives,
  };
}
