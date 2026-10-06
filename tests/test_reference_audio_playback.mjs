import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _collectGeneratedVideoAudioJobs(');
const collect = new Function('isDirectorTrackType', 'defaultImageMeta', 'referenceTimeline', 'normalizePlaybackRate', 'normalizeClipVolume',
    `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}})._collectGeneratedVideoAudioJobs`)(
    type => type === 'director', () => ({}), app => app.refs, value => value || 1, value => value ?? 1);
const clip = {id: 'clip', startTime: 5, endTime: 15, duration: 10};
const track = {id: 'track', type: 'director', clips: [clip]};
const meta = {volume: 0.5};
const app = {_allImageTracks: () => [track], _trackInfo: new Map(), _meta: new Map([['clip', meta]]),
    _clipUsesGeneratedPreview: () => false, _clipItems: () => [{kind: 'video'}, {kind: 'audio'}],
    _genEffectiveDurationSec: () => 20, _normalizeGenEditAudioDraft: rows => rows || [],
    refs: {videos: [{file: 'source.mp4', edit_start_sec: 2, trim_in_sec: 3, playback_rate: 0.5}],
        audios: [{file: 'voice.wav', edit_start_sec: 1, duration: 4, source_offset: 2}]}};
let jobs = collect.call(app, 5);
assert.equal(jobs.length, 2);
assert.equal(jobs[0].absStart, 7);
assert.equal(jobs[0].absEnd, 15);
assert.equal(jobs[0].playbackRate, 0.5);
assert.equal(jobs[0].volume, 0.5);
assert.equal(jobs[1].absStart, 6);
app.refs.videos[0].muted = true;
assert.equal(collect.call(app, 5).length, 1);
meta.muted = true;
assert.equal(collect.call(app, 5).length, 0);
meta.muted = false; track.muted = true;
assert.equal(collect.call(app, 5).length, 0);
console.log('Ordinary director Clip reference video/audio plays without a saved child timeline, respecting trims, speed and mute.');
