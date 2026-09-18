import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
    const start = source.indexOf('    ' + name + '(');
    return new Function('return ({' + source.slice(start, source.indexOf('\n    }', start) + 6) + '}).' + name)();
}
const start = source.indexOf('function normalizeGeneratedVideo(');
const normalize = new Function('normalizeOutputVideoPath', 'normalizeClipVolume', 'genVideoUid',
    source.slice(start, source.indexOf('\n}', start) + 2) + ';return normalizeGeneratedVideo;')(file => file, v => v ?? 1, () => 'video');
const row = normalize({ id: 'video', file: 'video.mp4', media_scale: 75, media_offset_x: 12.5, media_offset_y: -20 });
assert.deepEqual([row.media_scale, row.media_offset_x, row.media_offset_y], [75, 12.5, -20]);
const restored = normalize(JSON.parse(JSON.stringify(row)));
assert.deepEqual(restored, row);
assert.equal(normalize({ file: 'video.mp4' }).media_scale, 100);
assert.equal(normalize({ file: 'video.mp4', media_scale: 500 }).media_scale, 300);
const clip = { id: 'selected', track: { locked: false } };
let saved = 0, rendered = 0;
const app = { _genEditState: { timeline: { getSelectedClips: () => [clip] }, audioMap: new Map(),
    clipMap: new Map([[clip.id, row.id]]), draft: [row] },
    _pullGenEditDraftFromTimeline() {}, _applyGenEditChanges() { saved++; }, _scheduleGenEditPreview() { rendered++; } };
const output = {};
const input = { dataset: { genTransform: 'media_offset_x' }, min: '-100', max: '100', value: '35.5',
    closest: () => ({ querySelector: () => output }) };
method('_onGenEditTransformInput').call(app, input);
assert.equal(row.media_offset_x, 35.5);
assert.equal(output.textContent, '35.5%');
assert.equal(saved, 1);
assert.equal(rendered, 1);
clip.track.locked = true;
input.value = '50';
method('_onGenEditTransformInput').call(app, input);
assert.equal(saved, 1);
clip.track.locked = false;
app._genEditState.audioMap.set(clip.id, 'audio');
method('_onGenEditTransformInput').call(app, input);
assert.equal(saved, 1);

const calls = [];
const ctx = { save() {}, restore() {}, translate(...args) { calls.push(['translate', ...args]); }, scale(...args) { calls.push(['scale', ...args]); } };
method('_drawMediaLayer').call({ _drawContain: () => true }, ctx, {}, 1000, 500,
    { mediaScale: 75, mediaOffsetX: 10, mediaOffsetY: -20 });
assert.deepEqual(calls, [['translate', 600, 150], ['scale', 0.75, 0.75], ['translate', -500, -250]]);
const layers = method('_collectGenEditPreviewLayers').call({ _genEditState: { draft: [row] },
    _genEditParentDuration: () => 5, _findClipById: () => ({ name: 'Clip' }), _genEffectiveDurationSec: () => 5 }, 1);
assert.equal(layers[0].transform, row);
assert(source.includes('media_scale: v.media_scale ?? 100'));
console.log('Trim video transform: defaults, persistence, bounds, locked/audio guards and preview coordinates passed');
