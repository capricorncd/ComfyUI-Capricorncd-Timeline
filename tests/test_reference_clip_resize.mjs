import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _syncClipPrimaryAppearance(');
const sync = new Function('isDirectorTrackType', 'isDefaultClipName',
    `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}})._syncClipPrimaryAppearance`)(type => type === 'image', () => false);
const meta = {referenceTimeline: {videos: [], audios: []}};
const app = {_ensureClipMeta: () => meta, _normalizeVisualMeta() {}, _clipItems: () => [],
    _firstEnabledGeneratedVideo: () => null, _clipUsesGeneratedPreview: () => false, _refreshClipAppearance() {}};
const clip = {track: {type: 'image'}, sourceDuration: 5, duration: 10, name: 'Director'};
sync.call(app, clip);
assert.equal(clip.sourceDuration, Infinity);
assert.equal(clip.duration, 10);
delete meta.referenceTimeline;
clip.sourceDuration = 5;
sync.call(app, clip);
assert.equal(clip.sourceDuration, Infinity, 'Director Clip can extend before its reference child timeline is initialized');
clip.track.type = 'video'; clip.sourceDuration = 5;
sync.call(app, clip);
assert.equal(clip.sourceDuration, 5);
const decorateStart = source.indexOf('    _decorateClip(');
const decorate = new Function('isDirectorTrackType',
    `return ({${source.slice(decorateStart, source.indexOf('\n    }', decorateStart) + 6)}})._decorateClip`)(type => type === 'image');
clip.track.type = 'image';
decorate.call({}, clip);
assert.equal(clip.sourceDuration, Infinity, 'Conversion and track changes reset the source limit even without a primary-appearance refresh');
clip.track.type = 'video'; clip.sourceDuration = 5;
decorate.call({}, clip);
assert.equal(clip.sourceDuration, 5);
console.log('Reference director Clips resize independently from source duration; media Clips retain source limits.');
