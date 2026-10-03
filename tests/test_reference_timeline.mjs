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

const splitStart = source.indexOf('    _splitClip(clip) {');
const splitClip = new Function('isDirectorTrackType', 'referenceTimeline', 'sliceReferenceTimeline',
    'return ({' + source.slice(splitStart, source.indexOf('\n    }', splitStart) + 6) + '})._splitClip;')(
        type => type === 'image', referenceTimeline, slice);
function splitDirector(saved, time) {
    const track = {id:'director', type:'image', locked:false};
    const parent = {id:'parent', startTime:10, endTime:16, duration:6, track};
    const metadata = new Map([['parent', saved]]), clips = [];
    let undo = 0;
    const owner = {_meta:metadata, getFps:()=>24, _recordUndo:()=>undo++, _cloneClipMeta:structuredClone,
        _ensureClipMeta:c=>metadata.get(c.id), _clipItems:m=>m.items || [], _findMediaById:app._findMediaById,
        _decorateClip(){}, _updatePromptPanel(){}, _scheduleProgramPreview(){},
        _timeline:{currentTime:time, addClip(id,row){const c={...row,id:String(clips.length),track};clips.push(c);return c;},
            removeClip(){}, selectClip(){}},
        _directorKeyframes:{target:()=>({local:false,start:2,rate:2}),points:()=>[{time:5,description:'shot'}]}};
    splitClip.call(owner,parent);
    assert.equal(undo,1);
    return clips.map(c=>({clip:c,meta:metadata.get(c.id)}));
}
const legacy = {items:media};
const halves = splitDirector(legacy,13);
assert.equal(halves[0].meta.referenceTimeline.videos[0].trim_out_sec,3);
assert.equal(halves[1].meta.referenceTimeline.videos[0].trim_in_sec,3);
assert.equal(halves[1].meta.referenceTimeline.audios[0].source_offset,3);
assert.equal(halves[1].meta.referenceTimeline.audios[0].duration,3);
assert.equal(halves[0].meta.video_shots.points[0].time,1.5);
assert.equal(halves[1].meta.video_shots.points.length,0);
assert.equal(legacy.referenceTimeline,undefined,'Split does not mutate original metadata');
const edited = splitDirector({referenceTimeline:timeline},13);
assert.deepEqual(edited[1].meta.referenceTimeline,right);
edited[0].meta.referenceTimeline.audios[0].volume=0;
assert.equal(edited[1].meta.referenceTimeline.audios[0].volume,undefined);
console.log('Director split initializes legacy references, splits both media types at child time and preserves local keyframes');
