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
const app = {
    _ensureClipMeta:()=>meta,
    _clipGeneratedVideos:m=>m.generatedVideos.map(row=>({...row})),
    _ensureGenVideoDuration:async row=>{row.duration_sec=175/24;},
};
const resolve = method('_resolveH3VideoTiming', { h3TimingFromFilename, applyH3VideoTrim });
assert(await resolve.call(app, { track: { clips: [] } }));
assert.equal(meta.generatedVideos[0].trim_in_sec, 39/24);
assert.equal(await resolve.call(app, { track: { clips: [] } }), false);
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
