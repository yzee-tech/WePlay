// Turns raw keyboard and text-field events into typed characters and backspaces.
// Desktop keyboards deliver real keydown events. Android soft keyboards usually do not: they report
// key "Unidentified" (keyCode 229) and only change the text of a focused field, so we also read
// the field's value. The decoding is pure (no DOM) so it can be tested in node.

/**
 * Compares the field text before and after an input event.
 * Returns how many characters were deleted from the end of the old text and the characters added.
 */
export function diffText(prev, next) {
  let p = 0;
  const max = Math.min(prev.length, next.length);
  while (p < max && prev[p] === next[p]) p++;
  return { backspaces: prev.length - p, added: next.slice(p) };
}

export class InputDecoder {
  constructor(onChar, onBackspace) {
    this.onChar = onChar;
    this.onBackspace = onBackspace;
    this.last = '';
  }

  /** Real key events. Returns true when the key was consumed (the caller should preventDefault). */
  keydown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key === 'Backspace') { this.onBackspace(); return true; }
    if (typeof e.key === 'string' && e.key.length === 1) { this.onChar(e.key); return true; }
    return false; // Unidentified, Process, Enter, arrows...: handled elsewhere or by the text field
  }

  /** The text field changed (soft keyboard). `value` is the field's whole text now. */
  input(value) {
    const { backspaces, added } = diffText(this.last, value);
    for (let i = 0; i < backspaces; i++) this.onBackspace();
    for (const ch of added) this.onChar(ch);
    this.last = value;
  }

  /** Forget the field text, e.g. after the page clears the field. */
  reset() {
    this.last = '';
  }
}
