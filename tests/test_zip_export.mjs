import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const T = (key, values = {}) => `${key} ${JSON.stringify(values)}`;
function method(name, fetch = null) {
    const start = source.search(new RegExp(`    (async )?${name}\\(`));
    assert(start >= 0, name);
    const end = source.indexOf('\n    }', start) + 6;
    return new Function('T', 'fetch', 'api', 'window', `return ({${source.slice(start, end)}}).${name}`)(
        T, fetch, { apiURL: path => path }, { innerWidth: 1000, innerHeight: 800 });
}
function element(extra = {}) {
    const classes = new Set();
    return {
        listeners: {}, style: {}, hidden: false,
        classList: {
            contains: name => classes.has(name),
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
        },
        setAttribute(name, value) { this[name] = value; },
        addEventListener(name, fn) { this.listeners[name] = fn; },
        removeEventListener(name) { delete this.listeners[name]; },
        ...extra,
    };
}
function fixture(fetch) {
    const status = element(), startButton = element(), close = element(), path = element({ value: 'D:/exports/特别篇' });
    const workflow = element({ checked: true }), generated = element({ checked: true });
    const formats = ['directory', 'zip'].map(format => element({ dataset: { format } }));
    formats[0].classList.add('is-active');
    const controls = [path, workflow, generated, startButton, close, ...formats];
    const dialog = element({
        querySelector(selector) {
            return ({
                '[role="status"]': status, '.cat-te-export-start': startButton,
                '.cat-te-export-directory': path, '.cat-te-export-workflow': workflow,
                '.cat-te-export-generated': generated, '.cat-te-modal-close': close,
                '[data-format].is-active': formats.find(b => b.classList.contains('is-active')),
            })[selector];
        },
        querySelectorAll: selector => selector === '[data-format]' ? formats : controls,
        close() { this.closed = true; }, showModal() { this.open = true; },
    });
    const app = { exportDialog: dialog, _projectExportBusy: false, _exportRevealToken: null,
        _safeProjectFilename: () => '特别篇',
        _buildProject: () => ({ name: '特别篇', tracks: [] }), _exportWorkflowSnapshot: () => ({ nodes: [] }) };
    for (const name of ['_setExportStatus', '_resetProjectExport', '_projectExportSaved', '_projectZipFilename', '_runProjectExport', '_exportProjectInBrowser', '_openExportDirectory', '_openExportDialog']) {
        app[name] = method(name, fetch);
    }
    const setup = source.slice(source.indexOf('        this.exportDialog = el.querySelector('), source.indexOf('        this.shortcutsDialog = el.querySelector('));
    new Function('el', 'T', setup).call(app, { querySelector: () => dialog }, T);
    return { app, status, startButton, path, workflow, generated, formats, controls, dialog };
}
const success = { path: 'D:/exports/特别篇/特别篇_20260912_120000.zip', reveal_token: 'saved-token', missing: [] };
for (const format of ['directory', 'zip']) {
    const requests = [];
    const f = fixture(async (url, options) => {
        requests.push({ url, body: JSON.parse(options.body) });
        return { ok: true, json: async () => url.endsWith('export_save') ? success : { ok: true } };
    });
    await f.app._runProjectExport({ format, includeGenerated: false, includeWorkflow: false });
    assert.equal(requests[0].url, '/audio_keyframe_timeline/export_save');
    assert.deepEqual(requests[0].body, { project: { name: '特别篇', tracks: [] }, directory: f.path.value, format, workflow: null, include_generated: false });
    assert.equal(f.app._exportRevealToken, 'saved-token');
    assert.match(f.startButton.textContent, /open_folder_btn/);
    assert.match(f.status.textContent, /export_saved_path.*特别篇/);
    assert(f.status.classList.contains('is-ok'));
    assert(f.controls.every(c => !c.disabled));
    await f.app._openExportDirectory();
    assert.deepEqual(requests[1], { url: '/audio_keyframe_timeline/reveal_export', body: { reveal_token: 'saved-token' } });
    f.path.value = 'D:/other';
    f.dialog.listeners.input();
    assert.equal(f.app._exportRevealToken, null);
    assert.match(f.startButton.textContent, /export_title/);
    assert.equal(f.status.hidden, true);
    await f.app._runProjectExport({ format });
    assert.equal(requests[2].body.directory, 'D:/other');
    assert.deepEqual(requests[2].body.workflow, { nodes: [] });
    assert.equal(requests[2].body.include_generated, true);
}
{
    const f = fixture(async () => ({ ok: true, json: async () => success }));
    await f.app._runProjectExport({ format: 'directory' });
    f.formats[1].listeners.click();
    assert(f.formats[1].classList.contains('is-active'));
    assert(!f.formats[0].classList.contains('is-active'));
    assert.equal(f.formats[1]['aria-pressed'], 'true');
    assert.equal(f.app._exportRevealToken, null, 'format edits reset successful export');
    await f.app._runProjectExport({ format: 'zip' });
    f.generated.checked = false; f.dialog.listeners.input();
    assert.equal(f.app._exportRevealToken, null, 'checkbox edits reset successful export');
    Object.assign(f.dialog.style, { position: 'fixed', left: '30px', top: '40px', margin: '0', right: 'auto', bottom: 'auto' });
    f.app._openExportDialog();
    assert(Object.values(f.dialog.style).every(value => value === ''), 'reopen returns native dialog to centered positioning');
    assert.equal(f.dialog.open, true);
}
for (const failure of ['http', 'network', 'json']) {
    const f = fixture(async () => {
        if (failure === 'network') throw new TypeError('Connection lost');
        return { ok: failure !== 'http', json: async () => {
            if (failure === 'json') throw new SyntaxError('Invalid response');
            return { error: 'Disk full' };
        } };
    });
    await f.app._runProjectExport({ format: 'zip' });
    assert(f.status.classList.contains('is-error'));
    assert.match(f.status.textContent, /export_failed/);
    assert.equal(f.app._exportRevealToken, null);
    assert(f.controls.every(c => !c.disabled));
    assert.equal(f.app._projectExportBusy, false);
}
{
    let finish, calls = 0;
    const f = fixture(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
    const pending = f.app._runProjectExport({ format: 'zip' });
    assert(f.controls.every(c => c.disabled));
    let prevented = false;
    f.dialog.listeners.cancel({ preventDefault() { prevented = true; } });
    assert(prevented);
    await f.app._runProjectExport({ format: 'zip' });
    assert.equal(calls, 1);
    finish({ ok: true, json: async () => ({ ...success, missing: ['missing.png'] }) });
    await pending;
    assert.match(f.status.textContent, /missing.png/);
    assert(!f.status.classList.contains('is-ok'), 'missing assets retain a visible warning');
    assert(f.status.classList.contains('is-error'), 'incomplete exports use the error color');
}
{
    const f = fixture(async () => ({ ok: false, json: async () => ({ error: 'Export expired' }) }));
    f.app._projectExportSaved('old-token');
    await f.app._openExportDirectory();
    assert.match(f.status.textContent, /open_folder_failed.*Export expired/);
}
{
    const handle = element({ setPointerCapture() {} });
    const dialog = element({ tagName: 'DIALOG', querySelector: () => handle, getBoundingClientRect: () => ({ left: 100, top: 100, width: 460, height: 300 }) });
    method('_bindModalDrag').call({}, dialog);
    handle.listeners.pointerdown({ button: 0, target: { closest: () => null }, preventDefault() {}, clientX: 120, clientY: 120, pointerId: 1 });
    handle.listeners.pointermove({ clientX: 320, clientY: 220 });
    assert.equal(dialog.style.left, '300px');
    assert.equal(dialog.style.top, '200px');
    assert.equal(dialog.style.margin, '0', 'native dialog auto margins must be disabled during drag');
    handle.listeners.pointermove({ clientX: 2000, clientY: -20 });
    assert.equal(dialog.style.left, '532px'); assert.equal(dialog.style.top, '8px');
    handle.listeners.lostpointercapture();
    assert(!dialog.classList.contains('is-dragging'));
    assert(!handle.listeners.pointermove);
}
assert(source.includes('this.wmTabs = this.composeModal.querySelectorAll'), 'export buttons must not become watermark controls');
{
    const requests = [], writes = [], events = [];
    const f = fixture(async (url, options) => {
        events.push('fetch');
        requests.push({ url, body: JSON.parse(options.body) });
        return { ok: true, blob: async () => new Blob(['zip']), headers: { get: () => '' } };
    });
    f.path.value = '   ';
    f.app._projectExportSaved('previous-backend-export');
    f.app._pickDirectory = async () => {
        events.push('picker');
        return { name: '浏览器目录', getFileHandle: async name => {
            assert.equal(name, '特别篇.zip'); events.push('verify');
            return { getFile: async () => ({ size: 3 }) };
        } };
    };
    f.app._writeExportFile = async (directory, name, blob) => {
        assert(!f.status.classList.contains('is-ok'));
        assert(!f.status.classList.contains('is-error'));
        assert.match(f.status.textContent, /export_browser_zip_saving/);
        events.push('write'); writes.push({ name, text: await blob.text() });
    };
    await f.app._runProjectExport({ format: 'zip', includeWorkflow: false, includeGenerated: false });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/audio_keyframe_timeline/export_zip');
    assert.equal(requests[0].body.workflow, null);
    assert.equal(requests[0].body.include_generated, false);
    assert.deepEqual(writes, [{ name: '特别篇.zip', text: 'zip' }]);
    assert.deepEqual(events, ['picker', 'fetch', 'write', 'verify']);
    assert.equal(f.app._exportRevealToken, null);
    assert.match(f.startButton.textContent, /export_title/);
    assert.match(f.status.textContent, /export_saved_path.*浏览器目录\/特别篇.zip/);
    assert(f.status.classList.contains('is-ok'), 'success is green only after the ZIP was written and verified');
}
{
    const requests = [], writes = [];
    const project = { media: [{ file: 'media/images/场景.png' }] };
    const f = fixture(async (url, options) => {
        requests.push(url);
        if (!options) return { ok: true, blob: async () => new Blob(['image bytes']) };
        assert.equal(JSON.parse(options.body).include_generated, true);
        return { ok: true, json: async () => ({ project, files: [{ file: '场景.png', kind: 'image', arcname: 'media/images/场景.png' }] }) };
    });
    f.path.value = '';
    const directory = { name: '浏览器目录' };
    f.app._pickDirectory = async () => directory;
    f.app._assetFileUrl = file => 'asset/' + file;
    f.app._writeExportFile = async (dir, path, blob) => {
        assert.equal(dir, directory); writes.push({ path, content: await blob.text() });
    };
    await f.app._runProjectExport({ format: 'directory' });
    assert.deepEqual(requests, ['/audio_keyframe_timeline/export_prepare', 'asset/场景.png']);
    assert.deepEqual(writes.map(w => w.path), ['media/images/场景.png', 'workflow.json', 'project.json']);
    assert.equal(writes[0].content, 'image bytes');
    assert.deepEqual(JSON.parse(writes[2].content), project);
    assert.equal(f.app._exportRevealToken, null);
    assert.match(f.startButton.textContent, /export_title/);
    assert(f.status.classList.contains('is-ok'));
}
for (const format of ['directory', 'zip']) for (const failure of ['cancel', 'unsupported', 'write', 'close']) {
    let fetches = 0;
    const f = fixture(async () => {
        fetches++;
        return { ok: true, json: async () => ({ project: {}, files: [] }),
            blob: async () => new Blob(['zip']), headers: { get: () => '' } };
    });
    f.path.value = '';
    f.app._pickDirectory = async () => {
        if (failure === 'cancel') throw new DOMException('Picker cancelled', 'AbortError');
        if (failure === 'unsupported') throw new Error('Folder picker unavailable');
        return { name: 'dir', getFileHandle: async () => ({ createWritable: async () => ({
            async write() { if (failure === 'write') throw new DOMException('Write aborted', 'AbortError'); },
            async close() { if (failure === 'close') throw new DOMException('Close aborted', 'AbortError'); },
        }) }) };
    };
    f.app._writeExportFile = method('_writeExportFile');
    await f.app._runProjectExport({ format, includeWorkflow: false });
    if (failure === 'cancel') {
        assert.equal(fetches, 0);
        assert.match(f.status.textContent, /export_browser_cancelled/);
        assert(!f.status.classList.contains('is-error'));
    } else {
        assert(f.status.classList.contains('is-error'));
        assert.match(f.status.textContent, /export_failed/);
    }
    assert.equal(f.app._exportRevealToken, null);
    assert(f.controls.every(c => !c.disabled));
}
{
    const f = fixture(async () => ({ ok: true, blob: async () => new Blob(['zip']), headers: { get: () => '' } }));
    f.path.value = '';
    f.app._pickDirectory = async () => ({ name: 'dir', getFileHandle: async () => ({ getFile: async () => ({ size: 0 }) }) });
    f.app._writeExportFile = async () => {};
    await f.app._runProjectExport({ format: 'zip' });
    assert(f.status.classList.contains('is-error'));
    assert.match(f.status.textContent, /export_browser_zip_size_mismatch/);
    assert.equal(f.app._exportRevealToken, null);
}
for (const [name, expected] of [['特别篇', '特别篇.zip'], ['CON', '_CON.zip'], ['LPT1.foo', '_LPT1.foo.zip'], ['a\u0085b', 'a_b.zip']]) {
    assert.equal(method('_projectZipFilename').call({ _safeProjectFilename: () => name }), expected);
}
for (const path of ['../escape', '/absolute', 'media/../../escape', 'C:/escape']) {
    await assert.rejects(method('_writeExportFile').call({}, {}, path, new Blob()), /invalid_export_path/);
}
console.log('Project export: optional directory routing, browser saves/cancellation, backend reveal, busy/error/success state and modal dragging passed');
