import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../js/cap_timeline_editor.js', import.meta.url), 'utf8');
const start = source.indexOf('function onTeGlobalKeyDown(');
const code = source.slice(start, source.indexOf('\nfunction onTeGlobalKeyUp', start));
let routed = 0;
const editor = {handleModalKey() {routed++; return true;}};
const context = {_open: editor};
const handler = new Function('CapTimelineEditorApp', 'isEditingField', code + ';return onTeGlobalKeyDown;')(
    context, event => !!event.editing);
for (const modifier of ['ctrlKey', 'metaKey']) {
    const event = {key: 'v', code: 'KeyV', [modifier]: true, editing: true,
        stopPropagation() {this.stopped = true;}, stopImmediatePropagation() {this.immediate = true;},
        preventDefault() {this.prevented = true;}};
    handler(event);
    assert(event.stopped && event.immediate, 'Canvas shortcuts cannot receive text paste');
    assert(!event.prevented, 'Native paste must still dispatch to the text field');
}
assert.equal(routed, 0);
handler({key: 'v', code: 'KeyV', ctrlKey: true, editing: false});
assert.equal(routed, 1, 'Timeline Clip paste keeps its existing routing');
context._open = null;
handler({key: 'v', code: 'KeyV', ctrlKey: true, editing: true});
assert.equal(routed, 1, 'Closed editor does not intercept graph input');
console.log('PASS: text paste isolation, native paste, Clip shortcut routing and closed editor');

const utils = readFileSync(new URL('../js/timeline/utils.js', import.meta.url), 'utf8');
const fieldStart = utils.indexOf('export function isEditingField');
const isField = new Function('document', utils.slice(fieldStart, utils.indexOf('\n}', fieldStart) + 2)
    .replace('export function', 'return function'))({activeElement: null});
const appSource = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const methodStart = appSource.indexOf('    handleShortcutKey(');
const shortcut = new Function('isEditingField', 'return ({' + appSource.slice(methodStart,
    appSource.indexOf('\n    }', methodStart) + 6) + '}).handleShortcutKey')(isField);
let clipPastes = 0;
const app = {_overlay: {classList: {contains: () => true}}, _shortcutModKey: event => event.key,
    _pasteClips() {clipPastes++; return true;}};
const host = {closest: () => null};
const textarea = {closest: () => textarea};
for (const path of [[textarea, host], [textarea, {localName: 'cap-dialog'}, host]]) {
  for (const key of ['c', 'v', 'x']) {
    const event = {key, code: 'Key' + key.toUpperCase(), ctrlKey: true, target: host, composedPath: () => path,
        stopPropagation() {}, stopImmediatePropagation() {}, preventDefault() {this.prevented = true;}};
    assert.equal(shortcut.call(app, event), true);
    assert(!event.prevented, 'Sidebar and expanded prompt retain native text paste');
  }
}
assert.equal(clipPastes, 0, 'Retargeted Shadow DOM events never paste Clips');
