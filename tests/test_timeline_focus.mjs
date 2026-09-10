import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/timeline/Timeline.js', import.meta.url), 'utf8');
const start = source.indexOf('  _focusFromPointer(');
const end = source.indexOf('\n  }', start) + 4;
const focus = new Function(`return ({${source.slice(start, end)}})._focusFromPointer`)();
let focused = 0;
const timeline = { _container: { focus(options) { assert.equal(options.preventScroll, true); focused++; } } };
for (const region of ['ruler', 'clip', 'track', 'background']) {
    focus.call(timeline, { button: 0, target: { closest: () => null } });
}
assert.equal(focused, 4);
focus.call(timeline, { button: 0, target: { closest: () => ({}) } });
focus.call(timeline, { button: 2, target: { closest: () => null } });
assert.equal(focused, 4, 'inputs and right clicks retain their own focus');
assert.match(source, /addEventListener\('pointerdown', .*_focusFromPointer\(e\), true\)/);
const css = readFileSync(new URL('../js/cap_timeline_editor.css', import.meta.url), 'utf8');
const panel = css.match(/\.cat-te-clip-opacity-panel\s*\{([^}]+)\}/)[1];
assert.match(panel, /flex-direction: column/);
assert.match(panel, /gap: 10px/);
assert.match(panel, /padding: 10px 12px/);
console.log('Timeline pointer focus and media parameter spacing passed');
