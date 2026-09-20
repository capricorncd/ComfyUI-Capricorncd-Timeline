import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const ClipApp = { _clipClipboard: null };
let serial = 0;
const helpers = ['isSubtitleTrackType', 'isVoiceoverTrackType', 'isDirectorTrackType', 'isMediaTrackType']
    .map(name => {
        const start = source.indexOf(`function ${name}(`);
        return source.slice(start, source.indexOf('\n}', start) + 2);
    }).join('\n');
function method(name) {
    const start = source.indexOf(`    ${name}(`);
    assert(start >= 0, name);
    const body = source.slice(start, source.indexOf('\n    }', start) + 6);
    return new Function('CapTimelineEditorApp', 'uid', 'pickSubtitleStyle', 'defaultSubtitleMeta',
        `${helpers}\nreturn ({${body}}).${name}`)(ClipApp, () => `id_${++serial}`, value => ({...value}), () => ({}));
}
function fixture() {
    const tracks = [], selected = [];
    const addTrack = type => {
        const track = { id: `track_${++serial}`, type, clips: [], locked: false, visible: true };
        tracks.push(track);
        return track;
    };
    const tl = {
        tracks, currentTime: 12, _selectedIds: new Set(),
        getTrack: id => tracks.find(t => t.id === id),
        getSelectedClips: () => selected,
        addClip(trackId, data) {
            const track = this.getTrack(trackId);
            const clip = { ...data, id: `clip_${++serial}`, track,
                get endTime() { return this.startTime + this.duration; } };
            track.clips.push(clip);
            return clip;
        },
        selectClip(clip, {additive = false} = {}) {
            if (!additive) { selected.length = 0; this._selectedIds.clear(); }
            selected.push(clip); this._selectedIds.add(clip.id);
        },
    };
    const app = {
        _timeline: tl, _meta: new Map(), _trackInfo: new Map(),
        _cloneClipMeta: value => structuredClone(value),
        _createInsertTrack: addTrack, _addUserTrack: addTrack,
        _allAudioTracks: () => tracks.filter(t => t.type === 'audio'),
        _allVoiceoverTracks: () => tracks.filter(t => t.type === 'voiceover'),
        _allTextTracks: () => tracks.filter(t => t.type === 'text'),
        _allMediaTracks: () => tracks.filter(t => ['video', 'media'].includes(t.type)),
        _allImageTracks: () => tracks.filter(t => t.type === 'image'),
        _trackIndex: track => tracks.indexOf(track),
        _recordUndo() {}, _ensureTimelineLength() {}, _decorateClip() {},
        _updatePromptPanel() {}, _refreshTimelineDuration() {}, _scheduleProgramPreview() {}, _saveToWidgets() {},
    };
    for (const name of ['_snapshotClip', '_copySelectedClips', '_resolvePasteTrack', '_createPasteTrack', '_trackHasRoom', '_pasteGroupFitsAt', '_pasteClips']) app[name] = method(name);
    const copy = type => {
        const track = addTrack(type);
        const clip = tl.addClip(track.id, {name:'source', src:'video.mp4', startTime:2, duration:5,
            sourceOffset:1, sourceDuration:20, playbackRate:1.5, hasAudio:true});
        app._meta.set(clip.id, {clipType:type === 'video' ? 'media' : type, muted:true});
        tl.selectClip(clip);
        assert(app._copySelectedClips());
        return clip;
    };
    return {app, tl, tracks, addTrack, copy};
}

for (const [type, expected] of [['video','video'], ['media','video'], ['image','image'], ['audio','audio'], ['text','text'], ['voiceover','voiceover']]) {
    const {app, tl, copy} = fixture();
    const original = copy(type);
    assert.equal(ClipApp._clipClipboard[0].trackType, expected, `${type}: copy preserves track kind`);
    assert(app._pasteClips());
    const pasted = tl.getSelectedClips()[0];
    assert.equal(pasted.track, original.track, `${type}: paste uses original track`);
    assert.equal(pasted.startTime, 12);
    for (const key of ['duration', 'sourceOffset', 'playbackRate', 'hasAudio']) assert.equal(pasted[key], original[key], key);
    assert.equal(pasted.sourceDuration, type === 'voiceover' ? Infinity : original.sourceDuration);
    assert.equal(app._meta.get(pasted.id).muted, true);
}
for (const reason of ['occupied', 'removed', 'locked', 'hidden']) {
    const {app, tl, tracks, addTrack, copy} = fixture();
    addTrack('image'); // A director track must never receive a copied media clip.
    const original = copy('video');
    if (reason === 'occupied') tl.currentTime = original.startTime;
    if (reason === 'removed') tracks.splice(tracks.indexOf(original.track), 1);
    if (reason === 'locked') original.track.locked = true;
    if (reason === 'hidden') original.track.visible = false;
    assert(app._pasteClips());
    const pasted = tl.getSelectedClips()[0];
    assert.equal(pasted.track.type, 'video', `${reason}: creates a media track, not a director track`);
    assert.notEqual(pasted.track, original.track);
    assert.equal(pasted.startTime, tl.currentTime);
}
for (const reason of ['removed', 'locked', 'hidden']) {
    const {app, tl, tracks, addTrack, copy} = fixture();
    const fallback = addTrack('text');
    const first = copy('text');
    const second = copy('text');
    const adjacent = tl.addClip(second.track.id, {name:'adjacent', startTime:7, duration:2});
    app._meta.set(adjacent.id, {clipType:'subtitle'});
    tl.selectClip(first);
    tl.selectClip(second, {additive:true});
    tl.selectClip(adjacent, {additive:true});
    app._copySelectedClips();
    for (const track of [first.track, second.track]) {
        if (reason === 'removed') tracks.splice(tracks.indexOf(track), 1);
        if (reason === 'locked') track.locked = true;
        if (reason === 'hidden') track.visible = false;
    }
    assert(app._pasteClips());
    const pasted = [...tl.getSelectedClips()];
    assert.equal(pasted.length, 3);
    assert.equal(pasted[0].track, fallback);
    assert.notEqual(pasted[0].track, pasted[1].track, `${reason}: overlapping subtitles retain separate tracks`);
    assert.equal(pasted[1].track, pasted[2].track, `${reason}: adjacent subtitles stay together`);
    assert.deepEqual(pasted.map(c => c.startTime), [12, 12, 17]);
    assert(app._pasteClips());
    for (const track of tracks.filter(t => !t.locked && t.visible)) {
        const ordered = [...track.clips].sort((a,b) => a.startTime - b.startTime);
        for (let i = 1; i < ordered.length; i++) assert(ordered[i - 1].endTime <= ordered[i].startTime);
    }
}
{
    const {app, tl, copy} = fixture();
    const original = copy('text');
    // Also handle overlapping snapshots already present in an imported project.
    ClipApp._clipClipboard.push(structuredClone(ClipApp._clipClipboard[0]));
    assert(app._pasteClips());
    const [first, second] = tl.getSelectedClips();
    assert.notEqual(first.track, second.track);
    assert.equal(original.startTime, 2);
    assert.equal(first.startTime, 12);
    assert.equal(second.startTime, 12);
}
console.log('Clip copy/paste: track types, timing, metadata, subtitle collisions and repeated paste passed');
