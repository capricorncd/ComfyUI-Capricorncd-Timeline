import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { h3TimingFromFilename, applyH3VideoTrim, replaceH3ContextTail } from '../js/editor/H3Timing.js';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
let serial = 0;
const deps = { h3TimingFromFilename, applyH3VideoTrim, replaceH3ContextTail,
    normalizeOutputVideoPath: value => value, genVideoUid: () => 'new_' + ++serial };
const begin = source.indexOf('function normalizeGeneratedVideo(');
deps.normalizeGeneratedVideo = new Function(...Object.keys(deps),
    source.slice(begin, source.indexOf('\n}', begin) + 2) + '; return normalizeGeneratedVideo;')(...Object.values(deps));
function method(name) {
    const start = source.search(new RegExp('    (async )?' + name + '\\('));
    assert(start >= 0, name);
    return new Function(...Object.keys(deps), 'return ({' +
        source.slice(start, source.indexOf('\n    }', start) + 6) + '}).' + name)(...Object.values(deps));
}
function fixture(metas) {
    const track = {clips:[]};
    track.clips = metas.map((meta, i) => ({id:'clip_' + i, track, startTime:i * 5, endTime:(i + 1) * 5, duration:5}));
    const pending = [];
    const app = {
        _meta:new Map(track.clips.map((clip, i) => [clip.id, metas[i]])),
        _timeline:{_playing:true}, _timelineReady:true,
        _findClipById:id => track.clips.find(clip => clip.id === id),
        _ensureClipMeta:clip => app._meta.get(clip.id),
        _clipGeneratedVideos:meta => (meta.generatedVideos || []).map(deps.normalizeGeneratedVideo),
        _isOutputPickerClip:() => true, _recordUndo() {}, _ensureResourceDuration() {},
        _decorateClip() {}, _saveToWidgets() {}, _syncClipPrimaryAppearance() {},
        _updateEditModeToolbar() {}, _scheduleProgramPreview() {},
        _startAudioPlayback() { app.restarts = (app.restarts || 0) + 1; },
        _ensureGenVideoDuration:async row => {
            const timing = h3TimingFromFilename(row.file);
            row.duration_sec = timing ? timing.raw / timing.fps : 5;
        },
        _addGeneratedVideosToClip:method('_addGeneratedVideosToClip'),
        _resolveH3VideoTiming:clip => {
            const job = method('_resolveH3VideoTiming').call(app, clip);
            pending.push(job);
            return job;
        },
    };
    return {app, clips:track.clips, settle:async () => { await Promise.all(pending.splice(0)); await Promise.resolve(); }};
}
const row = (id, timing) => deps.normalizeGeneratedVideo({id, file:id + timing + '.mp4'});
const audio = (id, from) => ({id, file:id + '.wav', from_gen_id:from, muted:false, volume_points:[{source_ms:0,gain:0.5}]});
const a = '__h3v2_c0_r124_h0_t4_f24000_s1_n0';
const b = '__h3v2_c22_r141_h0_t3_f24000_s1_n4';
const c = '__h3v2_c22_r141_h0_t2_f24000_s0_n3';
const metas = [a,b,c].map((timing, i) => ({generatedVideos:[row('old_' + i, timing)], genEditAudios:[]}));
const {app, clips, settle} = fixture(metas);
for (const clip of clips) await app._resolveH3VideoTiming(clip);
const oldFirstTail = metas[0].generatedVideos.find(r => r.h3_context_from);
metas[0].genEditAudios = [audio('base_first','old_0'), audio('tail_first',oldFirstTail.id)];
metas[1].genEditAudios = [audio('base_middle','old_1')];
metas[2].genEditAudios = [audio('base_last','old_2')];
const untouchedLast = structuredClone(metas[2]);
assert(app._addGeneratedVideosToClip(clips[1], ['new_middle' + b + '.mp4']));
await settle();
assert.equal(metas[1].generatedVideos.find(r => r.id === 'old_1').enabled, false);
assert(metas[1].genEditAudios.every(r => r.muted));
assert.equal(metas[0].generatedVideos.find(r => r.id === 'old_0').enabled, true);
assert.equal(metas[0].genEditAudios[0].muted, false, 'preceding base audio is still needed');
assert.equal(metas[0].genEditAudios[1].muted, true, 'superseded context audio must be muted');
assert.deepEqual(metas[2], untouchedLast, 'following clip and audio are untouched');
function checkChain() {
    for (const [i, meta] of metas.entries()) {
        const enabled = meta.generatedVideos.filter(r => r.enabled);
        assert.equal(enabled.filter(r => !r.h3_context_from).length, 1, 'one base version');
        assert.equal(enabled.filter(r => r.h3_context_from).length, i < 2 ? 1 : 0, 'required splice stays enabled');
        const frames = enabled.reduce((n, r) => n + (r.trim_out_sec - r.trim_in_sec) * 24, 0);
        assert(Math.abs(frames - 120) < 1e-6, 'visible duration remains five seconds');
    }
}
checkChain();
const middleBefore = structuredClone(metas[1]);
app._addGeneratedVideosToClip(clips[0], ['new_first' + a + '.mp4']);
await settle();
assert.deepEqual(metas[1], middleBefore);
checkChain();
const currentMiddle = metas[1].generatedVideos.find(r => r.enabled && !r.h3_context_from);
const currentTail = metas[1].generatedVideos.find(r => r.h3_context_from);
metas[1].genEditAudios = [audio('middle_current',currentMiddle.id),audio('middle_tail',currentTail.id)];
currentTail.muted = true;
await app._resolveH3VideoTiming(clips[1]);
assert(metas[1].generatedVideos.find(r => r.id === currentTail.id).muted, 'stable context keeps separated-audio mute');
app._addGeneratedVideosToClip(clips[2], ['new_last' + c + '.mp4']);
await settle();
assert.equal(metas[1].genEditAudios[0].muted, false);
assert.equal(metas[1].genEditAudios[1].muted, true);
checkChain();
const beforeDuplicate = structuredClone(metas);
assert.equal(app._addGeneratedVideosToClip(clips[2], ['new_last' + c + '.mp4']), false);
assert.deepEqual(metas, beforeDuplicate, 'repeat notifications do not change selection');
assert(app.restarts > 0, 'live audio playback refreshes after selection changes');

const plain = {generatedVideos:[row('old','')], genEditAudios:[audio('split','old')]};
const ordinary = fixture([plain]);
ordinary.app._addGeneratedVideosToClip(ordinary.clips[0], ['newest.mp4','older.mp4']);
await ordinary.settle();
assert.deepEqual(plain.generatedVideos.map(r => r.enabled), [true,false,false], 'batch links activate only newest version');
assert(plain.genEditAudios[0].muted);

const trimState = {clipId:ordinary.clips[0].id, timeline:{currentTime:2,_playing:true}, draft:[], audioDraft:[]};
ordinary.app._genEditState = trimState;
ordinary.app._cloneGenVideoDraft = row => ({...row});
ordinary.app._normalizeGenEditAudioDraft = rows => structuredClone(rows);
ordinary.app._buildGenEditTimeline = () => {
    trimState.timeline = {currentTime:0,_playing:false,setCurrentTime(t) { this.currentTime = t; },play() { this._playing = true; }};
};
ordinary.app._syncGenEditInspector = () => {};
ordinary.app._scheduleGenEditPreview = () => {};
ordinary.app._addGeneratedVideosToClip(ordinary.clips[0], ['final.mp4']);
await ordinary.settle();
assert.deepEqual(trimState.draft.map(r => r.enabled), [true,false,false,false], 'open trim editor sees new selection');
assert(trimState.audioDraft.every(r => r.muted));
assert.equal(trimState.timeline.currentTime, 2);
assert(trimState.timeline._playing, 'trim preview resumes at the same time');

const project = {tracks:[{clips:[{id:'closed',generated_videos:[row('old','')],gen_edit_audios:[audio('split','old')]},
    {id:'unrelated',generated_videos:[row('other','')]}]}]};
const unrelated = structuredClone(project.tracks[0].clips[1]);
const persist = method('_persistGeneratedVideosToProjectJson');
let saved;
const closedApp = {_parseProjectWidgetValue:() => ({project}), _writeProjectJson:value => { saved = JSON.parse(value); }};
assert(persist.call(closedApp, 'closed', ['newest.mp4','older.mp4']));
assert.deepEqual(saved.tracks[0].clips[0].generated_videos.map(r => r.enabled), [true,false,false]);
assert(saved.tracks[0].clips[0].gen_edit_audios[0].muted);
assert.deepEqual(saved.tracks[0].clips[1], unrelated);
assert.equal(persist.call(closedApp, 'closed', ['newest.mp4']), false);

// An earlier metadata probe must not re-enable a video superseded during its await.
const race = fixture([{generatedVideos:[row('racing',a)],genEditAudios:[]}]);
let release;
race.app._ensureGenVideoDuration = target => new Promise(resolve => {
    release = () => { target.duration_sec = 124 / 24; resolve(); };
});
const resolving = race.app._resolveH3VideoTiming(race.clips[0]);
race.app._meta.get('clip_0').generatedVideos[0].enabled = false;
release(); await resolving;
assert.equal(race.app._meta.get('clip_0').generatedVideos[0].enabled, false);
console.log('Generated video selection: versions, batch/duplicate links, closed editor, live audio, H3 chain and async probe passed');
