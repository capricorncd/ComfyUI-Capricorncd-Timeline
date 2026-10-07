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
clip.track.type = 'video'; clip.sourceDuration = 5;
sync.call(app, clip);
assert.equal(clip.sourceDuration, 5);
console.log('Reference director Clips resize independently from source duration; media Clips retain source limits.');
