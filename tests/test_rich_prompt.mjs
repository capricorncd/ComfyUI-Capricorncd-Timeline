import assert from 'node:assert/strict';
import { isPromptComment, stripPromptComments } from '../js/prompt_text.js';

globalThis.HTMLElement = class {};
globalThis.customElements = { define() {} };
const { toggleComment, RichPrompt } = await import('../js/components/RichPrompt.js');
const raw = '# Heading\r\n  // note\rtext // inline\nhttps://example.com\n/one\n\t// hidden';
assert.equal(stripPromptComments(raw), '# Heading\ntext // inline\nhttps://example.com\n/one');
assert(isPromptComment(' \t// note'));
assert(!isPromptComment('# Heading'));
let inputs = 0;
const ta = {
    value: '# Heading\nbody\nnext', selectionStart: 0, selectionEnd: 15,
    dispatchEvent(event) { assert.equal(event.type, 'input'); inputs++; },
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
};
toggleComment(ta);
assert.equal(ta.value, '//# Heading\n//body\nnext');
assert.deepEqual([ta.selectionStart, ta.selectionEnd], [2, 19]);
toggleComment(ta);
assert.equal(ta.value, '# Heading\nbody\nnext');
assert.deepEqual([ta.selectionStart, ta.selectionEnd], [0, 15]);
ta.value = '  //note'; ta.selectionStart = ta.selectionEnd = 8;
toggleComment(ta);
assert.equal(ta.value, '  note');
assert.equal(ta.selectionStart, 6);
ta.value = '\nnext'; ta.selectionStart = ta.selectionEnd = 0;
toggleComment(ta);
assert.equal(ta.value, '//\nnext');
for (const flag of ['readOnly', 'disabled']) {
    ta[flag] = true;
    const before = inputs;
    toggleComment(ta);
    assert.equal(inputs, before);
    ta[flag] = false;
}
globalThis.getComputedStyle = () => ({ color: 'black' });
const mirror = new RichPrompt(); mirror.style = {};
ta._capMirror = mirror; ta.value = '# Heading\n  // <note>\ntext // inline';
mirror.render(ta);
assert.equal((mirror.innerHTML.match(/cap-rich-comment/g) || []).length, 1);
assert(mirror.innerHTML.startsWith('# Heading\n'));
assert(mirror.innerHTML.includes('&lt;note&gt;'));
console.log('Rich prompt: slash comments, Markdown, URL, CRLF, toggle selections, readonly and highlighting passed');
