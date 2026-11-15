// Touch, mouse and keyboard input -> one input object for fighter 0.
// Joystick = left thumb, JUMP and FIRE buttons = right thumb, drag anywhere else on the screen to aim.
// There is no text field anywhere, so no soft keyboard can pop up and shrink the screen.
export class Controls {
  constructor(els) {
    this.els = els; // { stage, joy, knob, jump, fire }
    this.move = 0; this.jumpHeld = false; this.fireHeld = false;
    this.aimPoint = null; // client coordinates of the last aim touch
    this.keys = new Set();
    this.joyId = null; this.aimId = null;
    this.bind();
  }

  bind() {
    const { stage, joy, knob, jump, fire } = this.els;
    const joyMove = (e) => {
      const r = joy.getBoundingClientRect();
      const R = r.width / 2;
      let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const v = dx / R;
      this.move = Math.abs(v) < 0.25 ? 0 : Math.sign(v);
      // flick the stick up to jump as well
      if (dy / R < -0.7) this.jumpTap = true;
    };
    joy.addEventListener('pointerdown', (e) => { e.preventDefault(); joy.setPointerCapture(e.pointerId); this.joyId = e.pointerId; joyMove(e); });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === this.joyId) joyMove(e); });
    const joyEnd = (e) => { if (e.pointerId !== this.joyId) return; this.joyId = null; this.move = 0; knob.style.transform = ''; };
    joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);

    const hold = (el, key) => {
      const on = (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); this[key] = true; el.classList.add('down'); };
      const off = () => { this[key] = false; el.classList.remove('down'); };
      el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
    };
    hold(jump, 'jumpHeld'); hold(fire, 'fireHeld');

    stage.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (e.pointerType === 'mouse') this.fireHeld = true; // desktop: click to fire
      this.aimId = e.pointerId; this.aimPoint = { x: e.clientX, y: e.clientY };
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' || e.pointerId === this.aimId) this.aimPoint = { x: e.clientX, y: e.clientY };
    });
    const end = (e) => { if (e.pointerType === 'mouse') this.fireHeld = false; if (e.pointerId === this.aimId) this.aimId = null; };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    stage.addEventListener('contextmenu', (e) => e.preventDefault());

    addEventListener('keydown', (e) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', ' '].includes(e.key)) e.preventDefault(); this.keys.add(e.key.toLowerCase()); });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => { this.keys.clear(); this.fireHeld = false; this.jumpHeld = false; this.move = 0; });
  }

  /** Current input for fighter 0. aimFrom = the player's position in client pixels. */
  read(aimFrom) {
    const k = this.keys;
    let move = this.move;
    if (k.has('a') || k.has('arrowleft')) move = -1;
    if (k.has('d') || k.has('arrowright')) move = 1;
    const jump = this.jumpHeld || this.jumpTap || k.has('w') || k.has('arrowup') || k.has(' ');
    this.jumpTap = false;
    let aim = null;
    if (this.aimPoint && aimFrom) {
      const dx = this.aimPoint.x - aimFrom.x, dy = this.aimPoint.y - aimFrom.y;
      if (Math.hypot(dx, dy) > 12) aim = Math.atan2(dy, dx);
    }
    return { move, jump, fire: this.fireHeld || k.has('f'), aim };
  }
}
