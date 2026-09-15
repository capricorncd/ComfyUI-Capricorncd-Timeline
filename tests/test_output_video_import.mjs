import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _selectOutputVideoFile()');
const body = source.slice(start, source.indexOf('\n    }', start) + 6);

async function scenario(action, { fail = false, cancel = false } = {}) {
    let onChange, finish;
    const request = new Promise(resolve => { finish = resolve; });
    const file = new Blob(['video']);
    file.name = 'chosen.mp4';
    const input = { files: cancel ? [] : [file], addEventListener: (event, fn) => { onChange = fn; }, click() {} };
    const alerts = [], linked = [];
    const target = { id: 'first' }, other = { id: 'second' };
    const app = {
        _outputVideosClipId: target.id, _outputPickerKind: 'video', _timeline: {}, _meta: new Map(),
        outputVideosSelectFileBtn: { disabled: false }, outputVideosModal: { open: true },
        _outputVideosCache: [], _findClipById: id => id === target.id ? target : other,
        _isOutputPickerClip: clip => !!clip, _addGeneratedVideosToClip: (clip, files) => linked.push([clip, files]),
        _renderOutputVideosPicker() {},
    };
    const select = new Function('document', 'fetch', 'api', 'T', 'alert', `return ({${body}})._selectOutputVideoFile`)(
        { createElement: () => input }, () => request, { apiURL: path => path }, key => key, text => alerts.push(text));
    select.call(app);
    const pending = onChange();
    if (!cancel) assert.equal(app.outputVideosSelectFileBtn.disabled, true);
    action?.(app);
    finish({ ok: !fail, json: async () => fail ? { error: 'disk full' } : { file: 'imports/chosen.mp4', mtime: 1 } });
    await pending;
    assert.equal(app.outputVideosSelectFileBtn.disabled, false);
    return { linked, target, alerts, app };
}

let result = await scenario(app => { app._outputVideosClipId = 'second'; });
assert.deepEqual(result.linked, [[result.target, ['imports/chosen.mp4']]], 'Selection changes must not retarget an in-flight import');
result = await scenario(app => { app._meta = new Map(); });
assert.equal(result.linked.length, 0, 'Switching projects must not attach to the new project');
result = await scenario(null, { fail: true });
assert.equal(result.linked.length, 0);
assert.match(result.alerts[0], /disk full/);
result = await scenario(null, { cancel: true });
assert.equal(result.linked.length, 0);
assert.equal(result.alerts.length, 0);
console.log('Output video selection: target capture, project switch, upload failure and cancel passed');
