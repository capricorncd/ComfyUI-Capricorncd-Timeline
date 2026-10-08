import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../js/components/RichPrompt.js', import.meta.url), 'utf8');
const start = source.indexOf('export function replaceRichPromptRange(');
const replace = new Function('preparePromptEdit', 'syncPromptWidgetFromTextarea', 'updateRichPromptMirror',
    source.slice(start, source.indexOf('\n}', start) + 2).replace('export function', 'return function'))(
    ta => {ta._capRichHistory = {};}, () => {}, () => {});
const original = 'Hi @Hero walks';
const textarea = () => ({value: original, selectionStart: 0, selectionEnd: original.length,
    _capProtectedRanges: () => [{start: 3, end: 8}], focus() {}, dispatchEvent() {},
    setSelectionRange(start, end) {this.selectionStart = start; this.selectionEnd = end;}});
let ta = textarea();
replace(ta, '');
assert.equal(ta.value, '', 'Select all can delete a prompt containing references');
ta = textarea(); replace(ta, 'New prompt');
assert.equal(ta.value, 'New prompt', 'Paste replaces the entire selected prompt');
ta = textarea(); replace(ta, '', 3, 8);
assert.equal(ta.value, 'Hi  walks', 'A fully selected reference can be removed');
ta = textarea(); replace(ta, 'X', 4, 7);
assert.equal(ta.value, original, 'Partial edits inside a reference remain protected');
console.log('Full prompt and whole-reference replacement work while partial reference edits stay protected.');
