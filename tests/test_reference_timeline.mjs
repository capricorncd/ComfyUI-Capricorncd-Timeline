import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const code = readFileSync(new URL('../js/editor/ReferenceTimeline.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const referenceTimeline = new Function(code + '; return referenceTimeline;')();
const media = [{id: 'v', kind: 'video', file: 'source.mp4'}, {id: 'a', kind: 'audio', file: 'voice.wav'}];
const meta = {generatedVideos: [{file: 'result.mp4'}], genEditAudios: [{file: 'result.wav'}]};
const clip = {id: 'clip', duration: 5, track: {locked: false}};
const app = {_ensureClipMeta: () => meta, _clipItems: () => media, _findMediaById: id => media.find(row => row.id === id)};
const refs = referenceTimeline(app, clip);
assert.equal(refs.per_track, false);
assert.equal(refs.videos[0].media_id, 'v');
assert.equal(refs.audios[0].media_id, 'a');
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _applyGenEditChanges() {');
const apply = new Function('return ({' + source.slice(start, source.indexOf('\n    }', start) + 6) + '})._applyGenEditChanges;')();
let undos = 0, saves = 0;
Object.assign(app, {
    _genEditState: {reference: true, clipId: clip.id, perTrack: false, draft: refs.videos, audioDraft: refs.audios},
    _findClipById: () => clip, _normalizeGenEditAudioDraft: rows => structuredClone(rows),
    _recordUndo: () => undos++, _saveToWidgets: () => saves++,
});
apply.call(app);
assert.equal(undos, 1); assert.equal(saves, 1);
assert.deepEqual(meta.generatedVideos, [{file: 'result.mp4'}]);
assert.deepEqual(meta.genEditAudios, [{file: 'result.wav'}]);
app._genEditState.perTrack = true;
apply.call(app);
assert.equal(meta.referenceTimeline.per_track, true);
assert.equal(undos, 1, 'Child edits share the opening undo snapshot');
const stored = JSON.parse(JSON.stringify(meta.referenceTimeline));
assert.deepEqual(referenceTimeline(app, clip), stored);
const reload = referenceTimeline(app, clip); reload.videos[0].trim_in_sec = 2;
assert.equal(meta.referenceTimeline.videos[0].trim_in_sec, 0, 'Editing draft does not mutate saved references');
clip.track.locked = true;
app._genEditState.perTrack = false;
apply.call(app);
assert.equal(meta.referenceTimeline.per_track, true);
console.log('Reference timeline: legacy assets, default mix, separate persistence, undo, reload and locking passed');

media[0].file = 'relinked.mp4';
assert.equal(referenceTimeline(app, clip).videos[0].file, 'relinked.mp4');
const slice = new Function(code + '; return sliceReferenceTimeline;')();
const timeline = {per_track: false, videos: [{id: 'v', edit_start_sec: 1, trim_in_sec: 2, trim_out_sec: 10, playback_rate: 2}],
    audios: [{id: 'a', edit_start_sec: 0, source_offset: 3, duration: 6}]};
const right = slice(timeline, 3, 3);
assert.deepEqual(right.videos[0], {id: 'v', edit_start_sec: 0, trim_in_sec: 6, trim_out_sec: 10, playback_rate: 2});
assert.deepEqual(right.audios[0], {id: 'a', edit_start_sec: 0, source_offset: 6, duration: 3});
assert.equal(timeline.videos[0].trim_in_sec, 2);
assert.equal(slice(timeline, 5, 1).videos.length, 0);
console.log('Reference splitting preserves source ranges, playback speed and independent copies; relinking refreshes asset files');
