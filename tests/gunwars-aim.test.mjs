// Run with: node --test tests/
// Regression test for the "stickman turns backwards and can't turn around" bug:
// the last aim touch sticks forever, so after the player moves past that screen
// point the aim flips behind him and overrides the run direction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Controls } from '../stickman-gunwars/src/input.js';

// input.js binds keyboard listeners on the window; Node has no window.
globalThis.addEventListener ||= () => {};

// Minimal DOM stubs: just enough for Controls to bind and for us to fire events.
function makeEl() {
  const handlers = {};
  return {
    handlers,
    style: {},
    classList: { add() {}, remove() {} },
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    setPointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
    fire(type, ev) { (handlers[type] || []).forEach((fn) => fn({ preventDefault() {}, ...ev })); },
  };
}

function makeControls() {
  const els = { stage: makeEl(), joy: makeEl(), knob: makeEl(), jump: makeEl(), fire: makeEl() };
  return { controls: new Controls(els), els };
}

test('aim follows the drag while the finger is down', () => {
  const { controls, els } = makeControls();
  els.stage.fire('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 500, clientY: 300 });
  const input = controls.read({ x: 400, y: 300 });
  assert.ok(input.aim !== null, 'aim should be active during a drag');
  assert.ok(Math.abs(input.aim) < 0.01, 'aim should point right toward the finger');
});

test('lifting the aiming finger ends the aim: movement turns the stickman again', () => {
  const { controls, els } = makeControls();
  // Drag to aim at a point ahead on the right, then lift the finger.
  els.stage.fire('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 500, clientY: 300 });
  els.stage.fire('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 500, clientY: 300 });
  // The player runs and jumps right, past the old touch point. No finger down now.
  const input = controls.read({ x: 700, y: 300 });
  assert.equal(input.aim, null, 'a stale touch point must not keep aiming after the finger lifts');
});

test('a cancelled touch also ends the aim', () => {
  const { controls, els } = makeControls();
  els.stage.fire('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 500, clientY: 300 });
  els.stage.fire('pointercancel', { pointerId: 1, pointerType: 'touch' });
  assert.equal(controls.read({ x: 700, y: 300 }).aim, null);
});
