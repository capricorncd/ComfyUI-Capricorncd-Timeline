import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _replaceMediaReference(');
const replace = new Function('isDirectorTrackType', `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}})._replaceMediaReference`)(type => type === 'image');
for (const type of ['image', 'video']) {
    const media = {id: 'media', kind: 'video', file: 'old.mp4'};
    const duplicate = {id: 'duplicate', kind: 'video', file: 'new.mp4'};
    const clip = {id: 'clip', duration: 12, sourceOffset: 0, playbackRate: 1, _applyPosition() {}};
    const edits = {edit_start_sec: 2, trim_in_sec: 3, trim_out_sec: 9, playback_rate: 0.5,
        scale: 1.3, offset_x: 0.2, muted: false, volume: 0.7};
    const meta = {items: [{id: 'media', kind: 'video', file: 'old.mp4'}],
        referenceTimeline: {videos: [{id: 'ref_media', media_id: 'media', file: 'old.mp4', ...edits},
            {id: 'ref_duplicate', media_id: 'duplicate', file: 'new.mp4', ...edits}], audios: []}};
    let probes = 0;
    const app = {_timeline: {tracks: [{type, clips: [clip]}]}, _meta: new Map([['clip', meta]]),
        _projectResources: [media, duplicate], _recordUndo() {},
        _findMedia: (kind, file) => media.file === file ? media : duplicate.file === file ? duplicate : null,
        _clipItems: () => [{id: media.id, kind: media.kind, file: media.file}],
        _normalizeVisualMeta() {}, _syncClipPrimaryAppearance() {}, _videoUrl: file => file,
        async _probeVideoDuration() {probes++; return 5;}, _refreshTimelineDuration() {},
        _swapMediaListEntry() {}, _writeMediaMeta() {}, _getMediaMeta: () => ({})};
    replace.call(app, 'old.mp4', 'new.mp4', 'video');
    await Promise.resolve();
    assert.equal(media.file, 'new.mp4');
    assert.equal(clip.duration, type === 'image' ? 12 : 5);
    assert.equal(probes, type === 'image' ? 0 : 1);
    assert.equal(app._projectResources.length, 1);
    for (const reference of meta.referenceTimeline.videos) {
        assert.equal(reference.media_id, 'media');
        assert.equal(reference.file, 'new.mp4');
        for (const [name, value] of Object.entries(edits)) assert.equal(reference[name], value);
    }
}
console.log('Replacing a library video preserves director Clip duration while media Clips retain source-length clamping.');
