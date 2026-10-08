import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    async _addVideoAtTime(');
const insert = new Function('defaultImageMeta', 'isMediaTrackType',
    `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}})._addVideoAtTime`)(() => ({}), type => type === 'video');

for (const type of ['image', 'video']) {
    const track = {id: 'track', type};
    let clip, saved;
    const editor = {
        _meta: new Map(), _videoUrl: file => file, _probeVideoDuration: async () => 12,
        _grabVideoThumbnail: async () => null, _fetchPeaks: async () => ({peaks: [[]], buffer: {}}),
        _ensureTimelineLength() {}, _recordUndo() {}, _ensureMedia: () => ({id: 'media', kind: 'video', file: 'reference.mp4'}),
        _pickInsertMediaTrack: () => track, _pickInsertImageTrack: () => track,
        _trackHasRoom: () => true,
        _trackIndex: () => 0, _decorateClip() {}, _refreshTimelineDuration() {},
        _timeline: {
            addClip: (id, data) => (clip = {id: 'clip', track, ...data}),
            selectClip() {}, setCurrentTime() {},
        },
        _saveToWidgets() { saved = {clip: {...clip}, meta: {...this._meta.get(clip.id)}}; },
    };
    await insert.call(editor, 'reference.mp4', 3, null, {mediaTrack: type === 'video'});
    assert.equal(saved.clip.startTime, 3);
    assert.equal(saved.clip.duration, 12);
    assert.equal(saved.meta.clipRole, 'video_ref', 'Insertion saves the completed reference metadata');
    assert.equal(saved.meta.items[0].id, 'media');
    assert.equal(saved.clip.sourceDuration, type === 'image' ? Infinity : 12);
}
console.log('Video insertion persists the new Clip and references immediately; director Clips retain unlimited resize.');
