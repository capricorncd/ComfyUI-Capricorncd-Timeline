import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _onAutoPromptChange() {');
const change = new Function(`return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}})._onAutoPromptChange`)();
const meta = { autoPrompt: false };
const undo = []; let saves = 0;
const app = {
    _selClip: { id: 'clip' }, autoPromptCb: { checked: true, disabled: false },
    _recordUndo: () => undo.push(meta.autoPrompt), _ensureClipMeta: () => meta,
    _saveToWidgets: () => saves++,
};
change.call(app);
assert.equal(meta.autoPrompt, true);
app.autoPromptCb.checked = false;
change.call(app);
assert.equal(meta.autoPrompt, false);
assert.deepEqual(undo, [false, true]);
assert.equal(saves, 2);
app.autoPromptCb.disabled = true;
app.autoPromptCb.checked = true;
change.call(app);
assert.equal(meta.autoPrompt, false);
assert.equal(saves, 2);
console.log('PASS: auto prompt boolean, undo, save and disabled settings');
