import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripH3Timing} from '../js/editor/H3Timing.js';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _clipIdFromSpecifiedVideoPath(file) {');
const parse = new Function('normalizeOutputVideoPath', 'stripH3Timing',
    `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}})._clipIdFromSpecifiedVideoPath`)(file => file, stripH3Timing);
const prefix = 'CapTimelineEditor/project/20261007-010203_clip_1_abc';
assert.equal(parse(prefix + '.mp4'), 'clip_1_abc');
assert.equal(parse(prefix + '__kf3_1.mp4'), 'clip_1_abc');
assert.equal(parse(prefix + '__kf3_2__h3v2_c22_r124_h0_t3_f24000_s0_n0.mp4'), 'clip_1_abc');
assert.equal(parse(prefix + '__kf_note.mp4'), 'clip_1_abc__kf_note');
assert.equal(parse('unrelated.mp4'), null);
console.log('Keyframe filenames resolve to the original Clip, with and without H3 timing.');
