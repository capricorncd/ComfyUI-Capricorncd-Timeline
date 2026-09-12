import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TimelineHistory } from '../js/editor/TimelineHistory.js';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
let answer = true, asks = [];
const confirm = async (message, options) => {
    asks.push({message, options});
    return typeof answer === 'function' ? answer() : answer;
};
const method = name => {
    const at = source.search(new RegExp('    (?:async )?' + name + '\\('));
    assert(at >= 0);
    return new Function('showCapConfirm', 'T',
        'return ({' + source.slice(at, source.indexOf('\n    }', at) + 6) + '}).' + name)(
        confirm, (key, vars) => ({key, ...vars}));
};
function fixture() {
    asks = []; answer = true;
    const tracks = ['image', 'image', 'image', 'video', 'audio', 'text'].map((type, i) => ({
        type, locked: i === 1, visible: i !== 2,
        clips: [{id: String(i), startTime: i * 5, duration: 5}],
    }));
    const app = {
        _timeline: {tracks, _playing:true, currentTime: 4.25}, _loadSeq: 1,
        _meta: new Map(tracks.map((track, i) => [String(i), {
            generatedVideos: [{id:'v'+i, file:'same.mp4', enabled:i !== 2, muted:i === 1}, {id:'tail'+i, file:'next.mp4', h3_context_tail:true}],
            previewMode:'generated', disabled:i === 2, prompt:'keep prompt', seed:42,
            items:[{kind:'video', file:'reference.mp4'}], genEditAudios:[{file:'same.mp4', from_gen_id:'v'+i}],
        }])),
        _allImageTracks() { return this._timeline.tracks.filter(track => track.type === 'image'); },
        _clipsWithGeneratedVideoLinks: method('_clipsWithGeneratedVideoLinks'),
        _clearAllGeneratedVideoLinks: method('_clearAllGeneratedVideoLinks'),
        _genEditState: {clipId:'0'}, _genVideoState: {clipId:'1'}, _resourceGenPreview: {clipId:'2'},
        _outputVideosClipId:'0', _outputPickerKind:'video',
        _closeGenEditModal() { this.editClosed = true; },
        _closeGenVideoModal() { this.videoClosed = true; },
        _stopResourceGenProgramPreview() { this.hoverStopped = true; },
        _hideOutputVideoHoverPreview() {},
        _decorateClip() { assert.equal(this._clipsWithGeneratedVideoLinks().length, 0, 'clear the whole chain before refreshing'); },
        _syncClipPrimaryAppearance() {},
        _updateClipInfoPanel() { this.panelUpdated = true; },
        _renderOutputVideosPicker() { this.pickerUpdated = true; },
        _updateEditModeToolbar() { this.toolbarUpdated = true; },
        _saveToWidgets() { this.saves = (this.saves || 0) + 1; },
        _scheduleProgramPreview() { this.previewUpdated = true; },
        _startAudioPlayback() { this.audioRestarted = true; },
    };
    app._selClip = tracks[0].clips[0];
    app.history = new TimelineHistory({
        capture: () => structuredClone([...app._meta]),
        restore: snapshot => { app._meta = new Map(snapshot); },
        onChange() {},
    });
    app._recordUndo = () => { app.history.record(); app.undos = (app.undos || 0) + 1; };
    return app;
}
{
    const app = fixture(), before = structuredClone([...app._meta]), timing = JSON.stringify(app._timeline);
    await app._clearAllGeneratedVideoLinks();
    assert.equal(asks.length, 1);
    assert.deepEqual(asks[0].message, {key:'confirm_clear_generated_video_links', clips:3, videos:6});
    for (const [id, meta] of before) {
        const actual = app._meta.get(id);
        assert.deepEqual(actual, Number(id) < 3 ? {...meta, generatedVideos:[], previewMode:'media'} : meta);
    }
    assert.equal(JSON.stringify(app._timeline), timing, 'no timeline shift or seek change');
    assert.equal(app.undos, 1); assert.equal(app.saves, 1);
    for (const key of ['editClosed','videoClosed','hoverStopped','panelUpdated','pickerUpdated','toolbarUpdated','previewUpdated','audioRestarted']) assert(app[key], key);
    const cleared = structuredClone([...app._meta]);
    await app.history.undo(); assert.deepEqual([...app._meta], before, 'one undo restores all links');
    await app.history.redo(); assert.deepEqual([...app._meta], cleared, 'redo clears all links again');
    await app._clearAllGeneratedVideoLinks(); assert.equal(asks.length, 1, 'empty project needs no confirmation or undo');
}
{
    const app = fixture(), before = structuredClone([...app._meta]);
    answer = false; await app._clearAllGeneratedVideoLinks();
    assert.deepEqual([...app._meta], before); assert(!app.history.canUndo); assert(!app.saves);
}
for (const change of [app => app._loadSeq++, app => app._destroyed = true]) {
    const app = fixture(), before = structuredClone([...app._meta]);
    answer = () => { change(app); return true; };
    await app._clearAllGeneratedVideoLinks();
    assert.deepEqual([...app._meta], before, 'stale confirmation cannot edit another project');
    assert(!app.history.canUndo);
}
{
    const app = fixture();
    answer = () => { app._meta.get('0').generatedVideos.push({file:'late-result.mp4'}); return true; };
    await app._clearAllGeneratedVideoLinks();
    assert.equal(app._meta.get('0').generatedVideos.length, 0, 're-read links after confirmation');
}
assert.match(source, /label: T\("clear_generated_video_links"\),\s+disabled: !this\._clipsWithGeneratedVideoLinks\(\)\.length/);
assert.match(source, /fn: \(\) => void this\._clearAllGeneratedVideoLinks\(\)/);
const translations = readFileSync(new URL('../js/i18n/timeline_editor.js', import.meta.url), 'utf8');
assert.equal((translations.match(/confirm_clear_generated_video_links:/g) || []).length, 3);
console.log('Clear generated links: all director clips, no media/audio/timing changes, confirmation, undo/redo, stale project and preview cleanup passed');
