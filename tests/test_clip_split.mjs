import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
    const start = source.indexOf('    ' + name + '(');
    return new Function('isEditingField', 'isDirectorTrackType', 'defaultAudioMeta', 'defaultImageMeta',
        'return ({' + source.slice(start, source.indexOf('\n    }', start) + 6) + '}).' + name)(
        () => false, () => false, () => ({}), () => ({}));
}

for (const type of ['audio', 'image', 'video', 'text', 'voiceover']) {
    const track = { id: 'extra-track', type, clips: [] };
    const original = { id: 'original', track, name: 'Test', startTime: 2, duration: 6, endTime: 8,
        sourceOffset: 3, sourceDuration: 30, playbackRate: 2, src: 'source',
        _waveform: [0, 1, 0], _audioBuffer: {}, fadeIn: 0.5, fadeOut: 0.75 };
    track.clips.push(original);
    let undo = 0, serial = 0;
    const timeline = {
        tracks: [track], currentTime: 5,
        getSelectedClips: () => [original],
        removeTrack(id) { this.tracks = this.tracks.filter(t => t.id !== id); },
        addClip(id, data) {
            const owner = this.tracks.find(t => t.id === id);
            assert(owner, 'Splitting must not prune the destination track');
            const clip = { ...data, id: 'part-' + serial++, track: owner };
            owner.clips.push(clip);
            return clip;
        },
        removeClip(id, clipId) {
            track.clips = track.clips.filter(c => c.id !== clipId);
            app._meta.delete(clipId);
            app._pruneEmptyTrack(track);
        },
        selectClip(clip) { this.selected = clip; },
    };
    const app = {
        _timeline: timeline, _meta: new Map([[original.id, { volume: 0.8 }]]),
        _overlay: { classList: { contains: () => true } }, _shortcutModKey: e => e.key,
        _recordUndo() { undo++; }, getFps: () => 24, _cloneClipMeta: m => ({ ...m }),
        _pruneEmptyTrack: method('_pruneEmptyTrack'), _splitClip: method('_splitClip'),
        _decorateClip() {}, _updatePromptPanel() {}, _scheduleProgramPreview() {},
    };
    let prevented = false;
    assert.equal(method('handleShortcutKey').call(app, {
        key: 'x', ctrlKey: true, preventDefault() { prevented = true; }, stopPropagation() {},
    }), true);
    assert(prevented);
    assert.equal(undo, 1);
    assert.deepEqual(timeline.tracks, [track]);
    assert.equal(track.clips.length, 2);
    const [left, right] = track.clips;
    assert.deepEqual([left.startTime, left.duration, left.sourceOffset], [2, 3, 3]);
    assert.deepEqual([right.startTime, right.duration, right.sourceOffset], [5, 3, 9]);
    assert.equal(timeline.currentTime, 5);
    assert.equal(timeline.selected, left);
    assert.equal(app._meta.has(original.id), false);
    for (const part of track.clips) {
        assert.equal(part.src, original.src);
        assert.equal(part._audioBuffer, original._audioBuffer);
        assert.equal(part.waveformPeaks, original._waveform);
        assert.equal(app._meta.get(part.id).volume, 0.8);
    }
    if (type === 'audio') {
        assert.deepEqual([left.fadeIn, left.fadeOut, right.fadeIn, right.fadeOut], [0.5, 0, 0, 0.75]);
    }
    if (type === 'image') {
        const oneFrame = {...original, id: 'one-frame', startTime: 10, endTime: 12, duration: 2};
        track.clips.push(oneFrame);
        app._meta.set(oneFrame.id, {});
        timeline.currentTime = 10 + 1 / 24;
        timeline.getSelectedClips = () => [oneFrame];
        app._splitClip(oneFrame);
        assert.equal(track.clips.length, 4, 'an image can be split one frame from its start');
        assert(Math.abs(track.clips[2].duration - 1 / 24) < 1e-7);
        assert(Math.abs(track.clips[3].duration - (2 - 1 / 24)) < 1e-7);
        const lastFrame = {...original, id: 'last-frame', startTime: 13, endTime: 15, duration: 2};
        track.clips.push(lastFrame);
        app._meta.set(lastFrame.id, {});
        timeline.currentTime = 15 - 1 / 24;
        timeline.getSelectedClips = () => [lastFrame];
        app._splitClip(lastFrame);
        assert.equal(track.clips.length, 6, 'an image can also be split one frame from its end');
        assert(Math.abs(track.clips[5].duration - 1 / 24) < 1e-7);
    }
}
console.log('Ctrl+X splits the only clip on each track type without pruning the track or losing either half');

const timelineSource = readFileSync(new URL('../js/timeline/Timeline.js', import.meta.url), 'utf8');
const trimStart = timelineSource.indexOf('  _trimClipAtPlayhead(side) {');
const trim = new Function('return ({' + timelineSource.slice(trimStart,
    timelineSource.indexOf('\n  }', trimStart) + 4) + '})._trimClipAtPlayhead')();
for (const side of ['left', 'right']) {
    const clip = {
        startTime: 2, duration: 5, sourceOffset: 3, playbackRate: 2, track: {id: 'image'},
        get endTime() { return this.startTime + this.duration; },
        _applyPosition() { this.positioned = true; },
    };
    const events = [];
    const timeline = {
        _selected: clip, fps: 24,
        currentTime: side === 'left' ? 7 - 1 / 24 : 2 + 1 / 24,
        _snapTime: value => Math.round(value * 24) / 24,
        emit: event => events.push(event),
        removeClip() { assert.fail('trimming to one frame must not remove the Clip'); },
    };
    trim.call(timeline, side);
    assert(Math.abs(clip.duration - 1 / 24) < 1e-7, `${side} trim retains one frame`);
    assert.equal(clip.positioned, true);
    assert.deepEqual(events, ['clip:resizestart', 'clip:resize', 'clip:resizeend']);
    if (side === 'left') assert(Math.abs(clip.sourceOffset - (3 + (5 - 1 / 24) * 2)) < 1e-7);
    else assert.equal(clip.sourceOffset, 3);
}
const frameMeta = {};
const frameApp = {getFps: () => 24, _meta: new Map(), _ensureClipMeta: () => frameMeta};
method('_rememberResourceTiming').call(frameApp, {id: 'frame', startTime: 2, duration: 1 / 24});
assert(Math.abs(frameApp._meta.get('frame').resourceDurationSec - 1 / 24) < 1e-7,
    'saved image timing keeps the one-frame duration');
const adjacent = [{id: 'first', startTime: 2, duration: 1 / 24},
    {id: 'next', startTime: 2 + 1 / 24, duration: 1}];
for (const clip of adjacent) clip._applyPosition = () => {};
method('_reflowTrackNoOverlap').call(frameApp, {clips: adjacent});
assert(Math.abs(adjacent[1].startTime - (2 + 1 / 24)) < 1e-7,
    'a neighboring Clip stays adjacent to a one-frame Clip');
const linked = {id: 'audio', startTime: 2 + 1 / 24, duration: 1, _applyPosition() {}};
const syncApp = {
    getFps: () => 24, _mainTrack: {clips: [{id: 'image', startTime: 2, duration: 1 / 24}]},
    _allAudioTracks: () => [{clips: [linked]}], _allVoiceoverTracks: () => [], _allTextTracks: () => [],
    _meta: new Map([[linked.id, {resourceStartSec: linked.startTime, resourceDurationSec: 1}]]),
    _ensureClipMeta: () => ({}), _ensureResourceStart: () => 2, _ensureResourceDuration: () => 1 / 24,
    _reflowTrackNoOverlap: method('_reflowTrackNoOverlap'),
};
method('_rippleLinkedTracksFromImageLayout').call(syncApp);
assert(Math.abs(linked.startTime - (2 + 1 / 24)) < 1e-7,
    'a one-frame image does not shift linked audio on the timeline');
console.log('A one-frame image split and Q/W trims preserve the Clip');
