import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const component = readFileSync(new URL('../js/components/InlinePromptEditor.js', import.meta.url), 'utf8');
const start = component.indexOf('    paste(event) {');
const end = component.indexOf('\n    }', start) + 6;
let inserted;
const paste = new Function('replaceRichPromptRange', `return ({${component.slice(start, end)}}).paste`)((ta, text) => { inserted = text; });
const editor = { localName: 'cap-inline-prompt', textarea: { value: 'abc', selectionStart: 1, selectionEnd: 1 }, syncSelection() {}, paste };
const source = readFileSync(new URL('../js/cap_timeline_editor.js', import.meta.url), 'utf8');
const a = source.indexOf('function onTeGlobalPaste(e) {');
const b = source.indexOf('\n}', a) + 2;
const app = { _open: {} };
const capture = new Function('CapTimelineEditorApp', `${source.slice(a, b)};return onTeGlobalPaste;`)(app);
function event(path) {
    return { composedPath: () => path, clipboardData: { getData: type => type === 'text/plain' ? '粘贴\r\n文本' : '' },
        preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
}
const e = event([{}, editor]);
capture(e);
assert.equal(inserted, '粘贴\n文本');
assert(e.prevented && e.stopped, 'Paste is consumed before graph capture listeners');
inserted = undefined;
const graphEvent = event([{}]);
capture(graphEvent);
assert(!graphEvent.stopped && !graphEvent.prevented, 'Graph paste outside prompt remains available');
assert.equal(inserted, undefined);
editor.textarea.readOnly = true;
const readonlyEvent = event([editor]);
capture(readonlyEvent);
assert(readonlyEvent.stopped && readonlyEvent.prevented);
assert.equal(inserted, undefined);
app._open = null;
const closedEvent = event([editor]);
capture(closedEvent);
assert(!closedEvent.stopped);
assert.match(source, /window.addEventListener\("paste", onTeGlobalPaste, true\)/);
console.log('Prompt paste: plain text inserted, graph event blocked, readonly and outside paste preserved');
