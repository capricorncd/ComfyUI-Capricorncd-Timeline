import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyH3VideoTrim, stripH3Timing, h3TimingFromFilename, restoreH3ClipTiming, replaceH3ContextTail } from '../js/editor/H3Timing.js';

const prior = { id: 'first', file: 'first__h3v1_c0_r100_h0_t0_f24000_s1.mp4', enabled: true,
    duration_sec: 100 / 24, trim_in_sec: 0, trim_out_sec: 100 / 24, h3_trim_applied: true };
const next = { id: 'second', file: 'second__h3v1_c22_r122_h0_t0_f24000_s0.mp4', enabled: true,
    duration_sec: 122 / 24, trim_in_sec: 22 / 24, trim_out_sec: 122 / 24, h3_trim_applied: true };
const linked = replaceH3ContextTail([prior], [next], 100 / 24);
assert.equal(Math.round(linked[1].trim_out_sec * 24), 78);
assert.equal(Math.round(linked[0].trim_out_sec * 24), 22);
assert.equal(Math.round(linked[0].edit_start_sec * 24), 78);
assert.equal(Math.round(linked.reduce((n, r) => n + r.trim_out_sec - r.trim_in_sec, 0) * 24), 100);
assert.deepEqual(replaceH3ContextTail(linked, [next], 100 / 24), linked);
assert.equal(replaceH3ContextTail(linked, [], 100 / 24)[0].trim_out_sec, 100 / 24);
const secondRunPrior = {...prior, id: 'first-run2'};
const secondRunNext = {...next, id: 'second-run2'};
const archived = linked.map(row => ({...row, enabled: false}));
const rerun = replaceH3ContextTail([secondRunPrior, ...archived], [secondRunNext], 100 / 24);
assert.equal(rerun.length, 4, 'both old tracks remain alongside both new tracks');
for (const row of archived) assert.deepEqual(rerun.find(item => item.id === row.id), row,
    'old tracks retain their source, trims, placement and disabled state');
assert.deepEqual(replaceH3ContextTail(rerun, [secondRunNext], 100 / 24), rerun,
    'refreshing must not duplicate historical tracks');
const unlinked = replaceH3ContextTail(linked, [], 100 / 24);
assert.equal(unlinked.find(row => row.h3_context_from).enabled, false,
    'removing a continuation archives its context track instead of deleting it');

const chain = [
    {id:'a',file:'a__h3v2_c0_r124_h0_t4_f24000_s1_n0.mp4',duration_sec:124/24},
    {id:'b',file:'b__h3v2_c22_r141_h0_t3_f24000_s1_n4.mp4',duration_sec:141/24},
    {id:'c',file:'c__h3v2_c22_r141_h0_t2_f24000_s0_n3.mp4',duration_sec:141/24},
];
chain.forEach(row => assert(applyH3VideoTrim(row)));
assert.equal(Math.round(chain[1].trim_in_sec * 24), 18);
assert.equal(Math.round(chain[2].trim_in_sec * 24), 19);
for (const row of chain) assert.equal(Math.round((row.trim_out_sec-row.trim_in_sec)*24),120);
const firstParts = replaceH3ContextTail([chain[0]], [chain[1]], 5);
assert.equal(Math.round(firstParts[0].trim_out_sec * 24),18);
assert.equal(Math.round(firstParts[1].trim_out_sec * 24),102);
assert.throws(() => applyH3VideoTrim({file:chain[1].file,duration_sec:119/24}), /carry/);
assert.equal(stripH3Timing(chain[1].file),'b.mp4');
const carriedVideo = {id:'carried',file:'carried__h3v2_c22_r192_h0_t16_f24000_s1_n14.mp4',
    duration_sec:8, trim_in_sec:22/24, trim_out_sec:190/24, enabled:true, h3_trim_applied:true};
const priorVideo = {id:'prior',file:'prior__h3v2_c0_r158_h0_t14_f24000_s1_n0.mp4',
    duration_sec:158/24, trim_in_sec:0, trim_out_sec:6, enabled:true, h3_trim_applied:true};
const carriedRows = replaceH3ContextTail([priorVideo], [carriedVideo], 6);
assert.equal(Math.round(carriedRows.find(row => row.h3_context_from).trim_in_sec * 24), 14,
    'the preceding clip uses the successor frames whose audio matches its end');
assert.equal(Math.round(carriedRows.find(row => row.h3_context_from).trim_out_sec * 24), 22);


const file = 'CapTimelineEditor/test/20260910-120000_clip_1__h3v1_c39_r175_h0_t0_f24000_s1.mp4';
assert.equal(stripH3Timing(file), 'CapTimelineEditor/test/20260910-120000_clip_1.mp4');
assert.equal(h3TimingFromFilename(file).context, 39);
for (const frames of [175, 136]) {
    const gen = { file, duration_sec: frames / 24 };
    assert(applyH3VideoTrim(gen));
    assert.equal(gen.trim_in_sec, frames === 175 ? 39 / 24 : 0);
    assert.equal(gen.trim_out_sec - gen.trim_in_sec, 136 / 24);
    gen.trim_in_sec += 0.5;
    assert.equal(applyH3VideoTrim(gen), false); // Do not overwrite user edits.
}
assert.throws(() => applyH3VideoTrim({ file, duration_sec: 5 }));
const shifted = { id:'clip_cafe_03', start_ms:10833, end_ms:16500, duration_ms:5667,
    h3_layout:{start_sec:260/24, duration_sec:136/24, source_start_sec:10, source_duration_sec:5} };
const restored = restoreH3ClipTiming(shifted);
assert.deepEqual([restored.start_ms,restored.end_ms,restored.duration_ms], [10000,15000,5000]);
assert.equal(restored.resource_duration_sec, 5);
assert.equal(restored.h3_layout, undefined);
assert.equal(restoreH3ClipTiming(restored), restored);
const moved = restoreH3ClipTiming({...shifted,start_ms:12000});
assert.deepEqual([moved.start_ms,moved.duration_ms], [12000,5000]);
const resized = restoreH3ClipTiming({...shifted,duration_ms:6000});
assert.deepEqual([resized.start_ms,resized.duration_ms], [10000,6000]);

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
assert(!source.includes('_applyH3PlaybackLayout'));
assert(!source.includes('h3Layout'));
function method(name, dependencies = {}) {
    let start = source.indexOf(`    ${name}(`);
    if (start < 0) start = source.indexOf(`    async ${name}(`);
    assert(start >= 0);
    const end = source.indexOf('\n    }', start) + 6;
    return new Function(...Object.keys(dependencies), `return ({${source.slice(start,end)}}).${name}`)(...Object.values(dependencies));
}
const meta = { generatedVideos: [{ id:'gen1', file, enabled:true }] };
const parentDuration = method('_genEditParentDuration');
const lastClip = { id:'clip_cafe_03', startTime:10833/1000, duration:111/24 };
const trimApp = {
    _genEditState:{clipId:lastClip.id},
    _findClipById:id=>id === lastClip.id ? lastClip : null,
    _ensureClipMeta:()=>({resourceDurationSec:131/24}),
};
assert.equal(parentDuration.call(trimApp), 111/24);
assert.equal(parentDuration.call(trimApp, lastClip), 111/24);
lastClip.duration = 131/24;
assert.equal(parentDuration.call(trimApp), 131/24);
assert.equal(parentDuration.call(trimApp, null), 1);
assert(source.includes('const clipDur = this._genEditParentDuration(clip);'));
const app = {
    _ensureClipMeta:()=>meta,
    _clipGeneratedVideos:m=>m.generatedVideos.map(row=>({...row})),
    _ensureGenVideoDuration:async row=>{row.duration_sec=175/24;},
};
const resolve = method('_resolveH3VideoTiming', { h3TimingFromFilename, applyH3VideoTrim });
assert(await resolve.call(app, { track: { clips: [] } }));
assert.equal(meta.generatedVideos[0].trim_in_sec, 39/24);
assert.equal(await resolve.call(app, { track: { clips: [] } }), false);
const realign = method('_realignTrackGeneratedVideos', {
    h3TimingFromFilename, applyH3VideoTrim, replaceH3ContextTail,
    showCapAlert: () => { throw new Error('Unexpected alignment error'); }, T: key => key,
});
const firstClip = {id: 'first-clip', startTime: 0, duration: 100/24,
    get endTime() { return this.startTime + this.duration; }};
const secondClip = {id: 'second-clip', startTime: 100/24, duration: 100/24,
    get endTime() { return this.startTime + this.duration; }};
const otherClip = {id: 'other-clip', startTime: 0, duration: 1};
const realignTrack = {clips: [firstClip, secondClip], locked: false};
const unrelatedTrack = {clips: [otherClip]};
const staleFirst = {...prior, trim_in_sec: 0.5, trim_out_sec: 2,
    h3_context_original_out: 100/24, note: 'keep'};
const staleSecond = {...next, trim_in_sec: 0.25};
const byClip = new Map([
    [firstClip, {generatedVideos: [{...linked[0], trim_out_sec: 0.5}, staleFirst]}],
    [secondClip, {generatedVideos: [staleSecond]}],
    [otherClip, {generatedVideos: [{id:'other',file:'other.mp4',trim_in_sec:0.75}]}],
]);
let realignUndo = 0, realignSaved = 0, refreshed = 0;
const realignApp = {
    _timeline: {tracks: [realignTrack, unrelatedTrack]}, _loadSeq: 1, _meta: {set() {}},
    _ensureClipMeta: clip => byClip.get(clip),
    _clipGeneratedVideos: meta => meta.generatedVideos.map(row => ({...row})),
    _probeOutputVideoDuration: async file => file === prior.file ? 100/24 : 122/24,
    _ensureGenVideoAudioBuffer: async () => null, _matchGeneratedVideoAudio: () => null,
    _recordUndo() { realignUndo++; }, _decorateClip() {},
    _syncClipPrimaryAppearance() { refreshed++; },
    _saveToWidgets() { realignSaved++; }, _scheduleProgramPreview() {},
};
assert(await realign.call(realignApp, realignTrack));
const firstRows = byClip.get(firstClip).generatedVideos;
assert.equal(Math.round(firstRows.find(row => row.id === 'first').trim_out_sec * 24), 78);
assert.equal(Math.round(firstRows.find(row => row.h3_context_from).trim_out_sec * 24), 22);
assert.equal(firstRows.find(row => row.id === 'first').note, 'keep');
assert.equal(byClip.get(secondClip).generatedVideos[0].trim_in_sec, 22/24);
assert.equal(byClip.get(otherClip).generatedVideos[0].trim_in_sec, 0.75);
assert.equal(realignUndo, 1); assert.equal(realignSaved, 1); assert.equal(refreshed, 2);
assert.equal(await realign.call(realignApp, realignTrack), false, 'repeated realignment is unchanged');
assert.equal(realignUndo, 1);
realignTrack.locked = true;
assert.equal(await realign.call(realignApp, realignTrack), false);
assert.equal(realignUndo, 1);

const sampleRate = 12000, song = new Float32Array(sampleRate * 15), output = new Float32Array(sampleRate * 8);
for (let i = 0; i < song.length; i++) {
    song[i] = Math.sin(i * 0.071) + 0.3 * Math.sin(i * 0.0331) + 0.2 * Math.sin(i * 0.1037);
}
for (let i = 22 * sampleRate / 24; i < output.length; i++) {
    output[i] = song[Math.round((6 + i / sampleRate - 22 / 24) * sampleRate)];
}
const buffer = data => ({duration:data.length/sampleRate, sampleRate, numberOfChannels:1,
    getChannelData:() => data});
const soundClip = {startTime:100, endTime:115, sourceOffset:0, playbackRate:1, _audioBuffer:buffer(song)};
const visualClip = {startTime:106, endTime:113};
const matchAudio = method('_matchGeneratedVideoAudio', {h3TimingFromFilename,
    normalizePlaybackRate: rate => rate || 1});
const matchApp = {_timeline:{tracks:[{type:'audio', clips:[soundClip]}]}, _trackInfo:new Map(),
    _ensureClipMeta:() => ({})};
assert.equal(matchAudio.call(matchApp, visualClip,
    {file:carriedVideo.file, trim_in_sec:8/24, trim_out_sec:176/24}, buffer(output)), 22/24);
const visual17 = {id:'visual17',startTime:100,duration:6,
    get endTime() { return this.startTime + this.duration; }};
const visual18 = {id:'visual18',startTime:106,duration:7,
    get endTime() { return this.startTime + this.duration; }};
const visualTrack = {clips:[visual17,visual18]};
const sourceTrack = {id:'song-track',type:'audio',clips:[soundClip]};
const alignedMeta = new Map([
    [visual17,{generatedVideos:[{...priorVideo}]}],
    [visual18,{generatedVideos:[{...carriedVideo,trim_in_sec:8/24,trim_out_sec:176/24}]}],
]);
let alignedUndo = 0;
const alignedApp = {
    ...matchApp, _timeline:{tracks:[visualTrack,sourceTrack]},
    _ensureClipMeta:clip => alignedMeta.get(clip) || {},
    _clipGeneratedVideos:meta => (meta.generatedVideos || []).map(row => ({...row})),
    _probeOutputVideoDuration:async file => file === carriedVideo.file ? 8 : 158/24,
    _ensureGenVideoAudioBuffer:async file => file === carriedVideo.file ? buffer(output) : null,
    _matchGeneratedVideoAudio:matchAudio, _loadSeq:1, _meta:{set() {}},
    _recordUndo() { alignedUndo++; }, _decorateClip() {}, _syncClipPrimaryAppearance() {},
    _saveToWidgets() {}, _scheduleProgramPreview() {},
};
assert(await realign.call(alignedApp, visualTrack));
assert.equal(alignedMeta.get(visual18).generatedVideos[0].trim_in_sec, 22/24);
assert.equal(Math.round(alignedMeta.get(visual18).generatedVideos[0].trim_out_sec * 24), 190);
assert.equal(Math.round(alignedMeta.get(visual17).generatedVideos.find(row => row.h3_context_from).trim_in_sec * 24), 14);
assert.equal(alignedUndo,1);
assert.equal(await realign.call(alignedApp, visualTrack), false);
assert.equal(alignedUndo,1);


const project = {tracks:[{clips:[{id:'clip_1', generated_videos:[{...meta.generatedVideos[0],prompt:'keep this prompt',edit_start_sec:0.25}]}]}]};
const persist = method('_persistGeneratedVideosToProjectJson', {
    normalizeOutputVideoPath:value=>value, normalizeGeneratedVideo:row=>({...row}), genVideoUid:()=> 'new',
});
let saved;
assert(persist.call({_parseProjectWidgetValue:()=>({project}), _writeProjectJson:value=>{saved=JSON.parse(value);}}, 'clip_1', ['other.mp4']));
assert.equal(saved.tracks[0].clips[0].generated_videos[1].trim_in_sec, 39/24);
assert.equal(saved.tracks[0].clips[0].generated_videos[1].prompt, 'keep this prompt');
assert.equal(saved.tracks[0].clips[0].generated_videos[1].h3_trim_applied, true);
console.log('H3 trim and playback layout tests passed');

// The editor must not capture a pre-trim snapshot while its preceding clip is resolving.
{
    const order = [];
    const previous = {id: 'previous'}, current = {id: 'current'};
    const track = {type: 'image', clips: [previous, current]};
    previous.track = current.track = track;
    let release;
    const pending = new Promise(resolve => {release = resolve;});
    const ready = new Error('snapshot reached');
    const editor = {
        genEditModal: {}, _loadSeq: 1,
        async _resolveH3VideoTiming(clip) {
            order.push(clip.id);
            if (clip === previous) await pending;
        },
        _ensureClipMeta() { order.push('snapshot'); throw ready; },
    };
    const open = method('_openGenEditModal', {isSubtitleTrackType: () => false});
    const result = open.call(editor, current);
    assert.deepEqual(order, ['previous']);
    release();
    await assert.rejects(result, error => error === ready);
    assert.deepEqual(order, ['previous', 'current', 'snapshot']);
    order.length = 0;
    editor._resolveH3VideoTiming = async () => { editor._loadSeq++; };
    await open.call(editor, current);
    assert.deepEqual(order, [], 'changing projects while resolving must not open a stale editor');
}
