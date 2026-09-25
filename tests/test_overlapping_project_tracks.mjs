import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeClipTimingSecs } from '../js/timecode.js';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _splitOverlappingProjectTracks(project) {');
const end = source.indexOf('\n    }', start) + 6;
let serial = 0;
const split = new Function('decodeClipTimingSecs', 'uid', 'T',
    `return ({${source.slice(start, end)}})._splitOverlappingProjectTracks`)(decodeClipTimingSecs, () => ++serial, key => key);
const app = { getFps: () => 24 };
const clip = (id, start_ms, duration_ms, extra = {}) => ({ id, start_ms, duration_ms, ...extra });
const project = { tracks: [{
    id: 'original', name: 'Director', type: 'director', role: 'main',
    color: '#123456', muted: true, locked: true, enabled: false,
    clips: [clip('first', 21000, 7000), clip('second', 21000, 7000, { enabled: false }),
        clip('third', 21000, 7000), clip('next', 28000, 7000)],
}] };
const before = JSON.stringify(project);
const result = split.call(app, project);
assert.equal(JSON.stringify(project), before, 'loading does not mutate the supplied document');
assert.deepEqual(result.tracks.map(t => t.clips.map(c => c.id)), [['third'], ['second'], ['first', 'next']]);
assert.equal(result.tracks[2].id, 'original');
assert.equal(new Set(result.tracks.map(t => t.id)).size, 3);
assert.equal(result.tracks.filter(t => t.role === 'main').length, 1);
for (const track of result.tracks) {
    for (const key of ['type', 'color', 'muted', 'locked', 'enabled']) assert.equal(track[key], project.tracks[0][key]);
}
assert.equal(result.tracks[1].clips[0].enabled, false, 'disabled clips also remain individually accessible');
assert.deepEqual(split.call(app, JSON.parse(JSON.stringify(result))), result, 'save/reload does not create more tracks');

for (const type of ['audio', 'voiceover', 'subtitle', 'media']) {
    const chain = { tracks: [{ id: type, type, clips: [clip('a', 0, 2000), clip('b', 1000, 2000), clip('c', 2500, 2000)] }] };
    assert.deepEqual(split.call(app, chain).tracks.map(t => t.clips.map(c => c.id)), [['c'], ['b'], ['a']],
        'partial and chained overlaps retain paint order for every track type');
}
const adjacent = { tracks: [{ id: 'frames', clips: [clip('a', 0, 1042), clip('b', 1041, 1000)] }] };
assert.equal(split.call(app, adjacent).tracks.length, 1, 'rounded millisecond boundaries on the same frame are adjacent');

if (process.argv[2]) {
    const actual = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const normalized = split.call(app, actual);
    const ids = ['clip_2_mtldozjw', 'clip_5_mtlfif01', 'clip_6_mtlfjp7p'];
    const owners = ids.map(id => normalized.tracks.find(t => t.clips?.some(c => c.id === id)));
    assert(owners.every(Boolean));
    assert.equal(new Set(owners.map(t => t.id)).size, 3, 'the reported three clips are visible on separate tracks');
    const oldClips = actual.tracks.flatMap(t => t.clips || []).sort((a, b) => a.id.localeCompare(b.id));
    const newClips = normalized.tracks.flatMap(t => t.clips || []).sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(newClips, oldClips, 'all original clip data and timings are preserved');
    assert.deepEqual(split.call(app, normalized), normalized);
    console.log(`Project verified: ${actual.tracks.length} tracks -> ${normalized.tracks.length} tracks; file unchanged`);
}
console.log('PASS: overlapping clips load on separate persistent tracks');
