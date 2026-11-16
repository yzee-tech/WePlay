// Run with: node --test tests/
// Regression test for the "holding FIRE opens the phone's long-press menu" bug:
// the browser's context menu was only suppressed on the stage, not on the touch
// controls, so a long press on FIRE/JUMP/the joystick popped the system menu
// over the game.
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

for (const name of ['fire', 'jump', 'joy', 'stage']) {
  test(`long-press context menu is suppressed on ${name}`, () => {
    const { els } = makeControls();
    let prevented = false;
    els[name].fire('contextmenu', { preventDefault() { prevented = true; } });
    assert.ok(prevented, `contextmenu on ${name} must be prevented, or a long press opens the phone menu`);
  });
}

test('long-pressing FIRE still fires: suppressing the menu does not eat the press', () => {
  const { controls, els } = makeControls();
  els.fire.fire('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 0, clientY: 0 });
  els.fire.fire('contextmenu', { preventDefault() {} }); // the long-press moment
  assert.equal(controls.read({ x: 0, y: 0 }).fire, true, 'fire must stay held through the suppressed long-press');
});
