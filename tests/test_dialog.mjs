import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Exercise the actual shared drag implementation without a browser.
const source = readFileSync(new URL('../js/components/Dialog.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('export function resetDialogPosition'), source.indexOf('class DialogResizeHandle'));
const { bindDialogDrag, bindDialogResize, resetDialogPosition } = new Function(helpers.replaceAll('export function', 'function') + '; return {bindDialogDrag, bindDialogResize, resetDialogPosition};')();
function element(extra = {}) {
    const classes = new Set();
    return {
        listeners: {}, style: {},
        classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
        addEventListener(name, fn) { this.listeners[name] = fn; },
        removeEventListener(name) { delete this.listeners[name]; },
        ...extra,
    };
}
globalThis.window = element({ innerWidth: 1000, innerHeight: 800 });
const handle = element({ capture: null,
    setPointerCapture(id) { this.capture = id; },
    hasPointerCapture(id) { return this.capture === id; },
    releasePointerCapture() { this.capture = null; },
});
const target = element({ getBoundingClientRect() { return { left: parseFloat(this.style.left) || 100, top: parseFloat(this.style.top) || 100, width: 460, height: 300 }; } });
const cleanup = bindDialogDrag(target, handle);
const down = { button: 0, pointerId: 1, clientX: 120, clientY: 120, target: { closest: () => null }, preventDefault() {} };
handle.listeners.pointerdown({ ...down, target: { closest: () => ({}) } });
assert.equal(handle.capture, null, 'controls do not drag');
handle.listeners.pointerdown(down);
handle.listeners.pointermove({ pointerId: 2, clientX: 300, clientY: 220 });
assert.equal(target.style.left, undefined, 'other pointers are ignored');
handle.listeners.pointermove({ pointerId: 1, clientX: 320, clientY: 220 });
assert.equal(target.style.left, '300px'); assert.equal(target.style.top, '200px');
assert.equal(target.style.margin, '0');
handle.listeners.pointermove({ pointerId: 1, clientX: 2000, clientY: -20 });
assert.equal(target.style.left, '532px'); assert.equal(target.style.top, '8px');
handle.listeners.pointercancel();
assert(!target.classList.contains('is-dragging')); assert.equal(handle.capture, null);
window.innerWidth = 800; window.listeners.resize();
assert.equal(target.style.left, '332px', 'viewport resize keeps header reachable');
resetDialogPosition(target);
assert(Object.values(target.style).every(value => value === ''));
handle.listeners.pointerdown(down); cleanup();
assert.equal(handle.capture, null); assert.equal(Object.keys(handle.listeners).length, 0); assert.equal(Object.keys(window.listeners).length, 0);

globalThis.getComputedStyle = () => ({ getPropertyValue: name => name.endsWith('width') ? '560px' : '360px' });
const stopResize = bindDialogResize(target, handle);
handle.listeners.pointerdown({ ...down, button: 2 }); assert.equal(handle.capture, null);
handle.listeners.pointerdown(down);
handle.listeners.pointermove({ pointerId: 1, clientX: 0, clientY: 0 });
assert.equal(target.style.width, '560px'); assert.equal(target.style.height, '360px', 'per-dialog minima enforced');
handle.listeners.pointermove({ pointerId: 1, clientX: 3000, clientY: 3000 });
assert.equal(target.style.width, '640px'); assert.equal(target.style.height, '640px', '80vw/80vh caps enforced');
assert.equal(target.style.left, '100px'); assert.equal(target.style.top, '100px', 'resize keeps top-left fixed');
window.listeners.resize(); assert.equal(handle.capture, null, 'viewport changes cancel active resize');
window.innerWidth = 400; window.innerHeight = 300;
handle.listeners.pointerdown(down);
handle.listeners.pointermove({ pointerId: 1, clientX: -1000, clientY: -1000 });
assert.equal(target.style.width, '292px'); assert.equal(target.style.height, '192px', 'available screen space overrides minima');
stopResize(); assert.equal(handle.capture, null); assert.equal(Object.keys(handle.listeners).length, 0); assert.equal(Object.keys(window.listeners).length, 0);

const app = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const speech = readFileSync(new URL('../js/editor/SubtitleSpeech.js', import.meta.url), 'utf8');
for (const name of ['voice', 'export', 'shortcuts']) assert(app.includes(`<cap-dialog class="cat-te-${name}-dialog"`));
assert(app.includes('<cap-dialog class="cat-te-output-videos-modal"'));
assert(app.includes('else this.outputVideosModal.show();'), 'video associations stay non-modal');
assert(app.includes('if (kind === "audio") this.outputVideosModal.showModal();'), 'audio picker retains previous modal behavior');
assert(!app.includes('outputVideosModal.hidden'));
assert(!app.includes('_bindModalDrag('));
assert(speech.includes('document.createElement("cap-dialog")'));
assert(speech.includes('this.dialog.closeDisabled = true'));
assert(!/<dialog|createElement\("dialog"\)/.test(app + speech), 'native dialog creation belongs to component');
console.log('Dialog: drag/clamp/resize/cleanup, native-dialog migration and non-modal video association passed');
