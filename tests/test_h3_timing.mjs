import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyH3VideoTrim, stripH3Timing, h3TimingFromFilename, restoreH3ClipTiming } from '../js/editor/H3Timing.js';

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
assert(await resolve.call(app, {}));
assert.equal(meta.generatedVideos[0].trim_in_sec, 39/24);
assert.equal(await resolve.call(app, {}), false);
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
