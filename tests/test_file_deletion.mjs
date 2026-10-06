import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name, async = false) {
    const start = source.indexOf(`    ${async ? 'async ' : ''}${name}(`);
    assert(start >= 0);
    return new Function('T', `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}}).${name}`)(key => key);
}

const calls = [];
const app = {
    _recordUndo() {calls.push('undo');},
    _removeLibraryMediaEntry(file) {calls.push(file);},
    _syncSelectedClip() {}, _updatePromptPanel() {}, _renderMediaGrid() {},
    _refreshTimelineDuration() {}, _scheduleProgramPreview() {},
    _mediaBatchSelected: new Set(['asset']), _mediaBatchMode: true,
    _recycleGeneratedFile() {throw new Error('Materials must keep disk files');},
};
await method('_performMediaDelete', true).call(app, [{file:'input.png',kind:'image'}], true);
assert.deepEqual(calls, ['undo', 'input.png']);
assert.equal(app._mediaBatchSelected.size, 0);
assert.equal(app._mediaBatchMode, false);

for (const kind of ['Video', 'Audio']) {
    calls.length = 0;
    let confirm;
    const row = {id:'generated',file:kind === 'Video' ? 'generated.mp4' : 'generated.wav'};
    const owner = {
        _ensureClipMeta: () => ({}),
        [`_clipGenerated${kind}s`]: () => [row],
        _openDeleteConfirm(message, action) {assert.equal(message,'confirm_recycle_generated_file'); confirm=action;},
        async _recycleGeneratedFile(file, type = 'video') {calls.push(['recycle',file,type]);},
        [`_removeGenerated${kind}`]() {calls.push('remove');},
    };
    method(`_deleteGenerated${kind}`).call(owner, {}, row.id);
    assert.deepEqual(calls, []);
    await confirm();
    assert.deepEqual(calls, [['recycle',row.file,kind.toLowerCase()], 'remove']);
    calls.length = 0;
    owner._recycleGeneratedFile = async () => {throw new Error('Recycle failed');};
    await assert.rejects(confirm(), /Recycle failed/);
    assert.deepEqual(calls, []);
}
console.log('File deletion: materials keep disk files; generated video/audio recycle before unlinking, failures preserve associations.');
