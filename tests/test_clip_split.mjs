import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
    const start = source.indexOf('    ' + name + '(');
    return new Function('return ({' + source.slice(start, source.indexOf('\n    }', start) + 6) + '}).' + name)();
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
}
console.log('Ctrl+X splits the only clip on each track type without pruning the track or losing either half');
