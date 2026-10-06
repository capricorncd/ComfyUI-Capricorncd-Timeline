import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _collectGenEditPreviewLayers(t) {');
const collect = new Function('normalizePlaybackRate', `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}})._collectGenEditPreviewLayers`)(rate => rate || 1);
const app = {_genEditState: {clipId: 'clip', reference: true,
    timeline: {_contentEndTime: () => 20},
    draft: [{file: 'slow.mp4', duration_sec: 10, trim_in_sec: 0, trim_out_sec: 10, playback_rate: 0.5}]},
    _genEditParentDuration: () => 10, _findClipById: () => ({name: 'clip'}),
    _genEffectiveDurationSec: () => 20};
assert.equal(collect.call(app, 15).length, 1);
assert.equal(collect.call(app, 15)[0].playbackRate, 0.5);
assert.equal(collect.call(app, 20).length, 0);
app._genEditState.reference = false;
assert.equal(collect.call(app, 15).length, 0);
assert.match(source, /playEndTime: st.reference \? null : clipDur/);
console.log('Reference overhang remains previewable at reduced speed; generated trimming retains its Clip bound.');
