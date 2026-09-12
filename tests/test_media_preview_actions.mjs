import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TimelineHistory } from '../js/editor/TimelineHistory.js';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
let confirmed = true;
const method = name => {
    const start = source.search(new RegExp('    (?:async )?' + name + '\\('));
    assert(start >= 0, name);
    return new Function('isDirectorTrackType', 'isMediaTrackType', 'T', 'confirm', 'alert',
        'return ({' + source.slice(start, source.indexOf('\n    }', start) + 6) + '}).' + name)(
        type => type === 'image', type => type === 'video', (key, args) => ({ key, ...args }),
        () => confirmed, message => { throw new Error(JSON.stringify(message)); });
};
function fixture() {
    const clips = ['image', 'video', 'image', 'audio', 'text', 'voiceover'].map((type, i) => ({
        id: String(i), track: { type, locked: i === 2 }, startTime: i * 3, duration: 3,
    }));
    const app = {
        _mediaPreviewState: { items: [{ file: 'ref.png', kind: 'image' }], index: 0, browse: true, source: 'library' },
        _mediaStatus: new Map(), _meta: new Map(clips.map(clip => [clip.id, { items: [{ file: 'old.png' }] }])),
        _timeline: { getSelectedClips: () => clips, currentTime: 7, formatTime: n => String(n) },
        mediaPreviewInsertBtn: {}, mediaPreviewReplaceBtn: {}, mediaPreviewInsertClipBtn: {},
        mediaPreviewFooter: {}, mediaPreviewHint: {}, mediaPreviewPrevBtn: {}, mediaPreviewNextBtn: {},
        mediaPreviewModal: { classList: { toggle() {} } }, calls: [],
        _saveMediaPreviewMeta() { this.calls.push('saveMeta'); },
        _recordUndo() { this.history.record(); },
        _ensureClipMeta(clip) { return this._meta.get(clip.id); },
        _normalizeVisualMeta() {}, _ensureMedia: (kind, file) => ({ id: 'asset', kind, file }),
        _setClipPreviewItemIndex() {}, _syncClipPrimaryAppearance() {}, _renderMediaGrid() {},
        _saveToWidgets() {}, _refreshClipResourceViews() {}, _scheduleProgramPreview() {},
        _chooseMaterialFile(item) { this.calls.push(item); },
    };
    for (const name of ['_mediaPreviewItem', '_mediaPreviewCount', '_mediaPreviewIsClipSource',
        '_mediaPreviewClipTargets', '_insertMediaPreviewIntoClips', '_replaceMediaPreviewMaterial',
        '_updateMediaPreviewInsertBtn', '_applyMediaPreviewChrome', '_insertItemIntoClip']) app[name] = method(name);
    app.history = new TimelineHistory({
        capture: () => structuredClone([...app._meta]),
        restore: snapshot => { app._meta = new Map(snapshot); }, onChange() {},
    });
    return { app, clips };
}

for (const kind of ['image', 'video']) {
    const { app, clips } = fixture();
    app._mediaPreviewState.items[0].kind = kind;
    const before = structuredClone([...app._meta]);
    const timing = clips.map(clip => [clip.startTime, clip.duration]);
    app._updateMediaPreviewInsertBtn();
    assert.equal(app.mediaPreviewInsertClipBtn.disabled, false);
    assert.equal(app.mediaPreviewInsertClipBtn.title.count, 2);
    app._insertMediaPreviewIntoClips();
    for (const i of [0, 1]) {
        assert.equal(app._meta.get(String(i)).items.length, 2);
        assert.equal(app._meta.get(String(i)).items[1].kind, kind);
    }
    for (const i of [2, 3, 4, 5]) assert.deepEqual(app._meta.get(String(i)), before[i][1]);
    assert.deepEqual(clips.map(clip => [clip.startTime, clip.duration]), timing);
    assert.equal(app._timeline.currentTime, 7);
    await app.history.undo();
    assert.deepEqual([...app._meta], before);
    assert.equal(app.history.canUndo, false, 'multi-insert is one undo step');
    await app.history.redo();
    assert.equal(app._meta.get('1').items.length, 2);
}

for (const setup of [
    app => { app._mediaPreviewState.items[0].kind = 'audio'; },
    app => app._mediaStatus.set('image:ref.png', { location: 'missing' }),
    app => { app._timeline.getSelectedClips = () => []; },
    app => app._timeline.getSelectedClips().forEach(clip => { clip.track.locked = true; }),
    app => { app._mediaPreviewState.browse = false; },
]) {
    const { app } = fixture(); setup(app);
    app._insertMediaPreviewIntoClips();
    assert.equal(app.history.canUndo, false);
    if (app._mediaPreviewState.browse) {
        app._updateMediaPreviewInsertBtn();
        assert.equal(app.mediaPreviewInsertClipBtn.disabled, true);
    }
}

for (const source of ['library', 'clip']) {
    const { app } = fixture();
    app._mediaPreviewState.source = source;
    app._applyMediaPreviewChrome();
    assert.equal(app.mediaPreviewFooter.hidden, false, 'single asset still has footer');
    assert.equal(app.mediaPreviewInsertBtn.hidden, false);
    app._replaceMediaPreviewMaterial();
    assert.deepEqual(app.calls, ['saveMeta', { file: 'ref.png', kind: 'image' }]);
    assert.equal(app._mediaPreviewItem().file, 'ref.png', 'file picker does not replace before confirmation');
    app._mediaPreviewState.browse = false;
    app._applyMediaPreviewChrome();
    assert.equal(app.mediaPreviewFooter.hidden, true, 'generated audio solo viewer has no library actions');
}

const css = readFileSync(new URL('../js/cap_timeline_editor.css', import.meta.url), 'utf8');

// Selecting a file opens the existing preview; upload/relink happens only after confirmation.
{
    const app = {
        _pendingRelink: { file: 'old.png', kind: 'image' },
        _materialItemsFromFiles: () => ({ items: [{ file: { name: 'new.png' }, kind: 'image' }], unsupported: [] }),
        _renderAddMaterialPreview(items) { this.previewed = items; },
        insertAfterAddCb: { checked: true, closest: () => ({}) },
        _setAddMaterialMode(replace) { assert.equal(replace, true); },
        addMaterialModal: { hidden: true }, addMaterialConfirmBtn: {},
        _closeAddMaterial() { this.addMaterialModal.hidden = true; },
        async _uploadMaterialItem(item) { this.uploads++; return { file: item.file.name, kind: item.kind }; },
        _replaceMediaReference(...args) { this.replaced = args; },
        _saveToWidgets() {}, _renderMediaGrid() {}, uploads: 0,
    };
    const event = { target: { files: [{ name: 'new.png' }], value: 'new.png' } };
    method('_previewSelectedMaterial').call(app, event);
    assert.equal(app.addMaterialModal.hidden, false);
    assert.equal(app.previewed[0].file.name, 'new.png');
    assert.equal(app.uploads, 0);
    confirmed = false;
    await method('_confirmAddMaterial').call(app);
    assert.equal(app.uploads, 0);
    assert.equal(app.replaced, undefined);
    confirmed = true;
    await method('_confirmAddMaterial').call(app);
    assert.equal(app.uploads, 1);
    assert.deepEqual(app.replaced.slice(0, 4), ['old.png', 'new.png', 'image', true]);
    assert.equal(app.addMaterialModal.hidden, true);
}

// A completed replacement refreshes both library and Clip-source preview entries.
for (const source of ['library', 'clip']) {
    const { app } = fixture();
    app._mediaPreviewState.source = source;
    app._findMedia = () => null;
    app._timeline.tracks = [];
    app._swapMediaListEntry = () => {};
    app._writeMediaMeta = () => {};
    app._getMediaMeta = () => ({});
    app._showMediaPreviewAt = index => { app.shown = index; };
    method('_replaceMediaReference').call(app, 'ref.png', 'new.png', 'image');
    assert.equal(app._mediaPreviewItem().file, 'new.png');
    assert.equal(app.shown, 0);
}

assert(!css.includes('.cat-te-media-preview-solo .cat-te-media-preview-footer'));
assert.match(source, /<cap-button class="cat-te-media-preview-replace"/);
assert.match(source, /<cap-button class="cat-te-media-preview-insert-clip"/);
assert.match(source, /preview\.items = preview\.items\.map/);
assert.match(source, /this\._showMediaPreviewAt\(preview\.index\)/);
const translations = readFileSync(new URL('../js/i18n/timeline_editor.js', import.meta.url), 'utf8');
assert.equal((translations.match(/insert_into_selected_clips:/g) || []).length, 3);
console.log('Media preview actions: multi-insert, undo/redo, type/lock guards, footer and replacement picker passed');
