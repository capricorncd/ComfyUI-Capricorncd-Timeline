import assert from 'node:assert/strict';
import { mergeReferenceProject } from '../js/editor/MergeReferenceProject.js';

const current = { name: 'Current', settings: { fps: 24 }, media: [{ id: 'existing' }], tracks: [
    { id: 'track', locked: true, clips: [{ id: 'a', start_ms: 1000, duration_ms: 4000 }] },
    { clips: [{ id: 'audio', start_ms: 0, duration_ms: 9000, enabled: false }] },
] };
const reference = { media: [{ id: 'new' }], tracks: [{ id: 'track', clips: [
    { id: 'a', group_id: 'g', start_ms: 0, duration_ms: 2000, media_ids: ['image'],
        prompt_media_ids: ['image'], character_media_id: 'image', last_frame_media_id: 'second',
        keyframes: [{ time_ms: 500, prompt: 'keep text' }], source: { in_ms: 700 } },
    { id: 'b', group_id: 'g', start_ms: 2000, duration_ms: 1000, h3_timing: { previous_source_clip_id: 'a' } },
] }] };
const original = JSON.stringify({ current, reference });
for (const position of ['start', 'end']) {
    const merged = mergeReferenceProject(current, reference, { image: 'existing', second: 'new' }, position);
    assert.equal(merged.name, 'Current');
    assert.equal(merged.settings.fps, 24);
    assert.equal(merged.media.length, 2);
    assert.equal(merged.tracks[0].clips[0].start_ms, position === 'start' ? 4000 : 1000);
    assert.equal(merged.tracks[1].clips[0].start_ms, position === 'start' ? 3000 : 0);
    const [a, b] = merged.tracks[2].clips;
    assert.equal(a.start_ms, position === 'start' ? 0 : 9000);
    assert.equal(b.start_ms, a.start_ms + 2000);
    assert.notEqual(a.id, 'a');
    assert.notEqual(merged.tracks[2].id, 'track');
    assert.equal(b.h3_timing.previous_source_clip_id, a.id);
    assert.equal(a.group_id, b.group_id);
    assert.notEqual(a.group_id, 'g');
    assert.deepEqual(a.media_ids, ['existing']);
    assert.deepEqual(a.prompt_media_ids, ['existing']);
    assert.equal(a.last_frame_media_id, 'new');
    assert.equal(a.source.in_ms, 700);
    assert.equal(a.keyframes[0].time_ms, 500);
}
assert.equal(JSON.stringify({ current, reference }), original);
assert.equal(mergeReferenceProject({ tracks: [] }, reference, {}, 'end').tracks[0].clips[0].start_ms, 0);
console.log('Reference project merge timing and identity tests passed');
