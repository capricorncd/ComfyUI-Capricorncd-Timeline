import assert from 'node:assert/strict';
import {cleanRunPrompts} from '../js/editor/RunPromptCleanup.js';
const project = {settings: {prepend_prompt: '// private note\nUse light'},
    media: [{id: 'a', name: '流川枫长发'}, {id: 'b', name: '球场'}],
    tracks: [{clips: [{prompt: '//@流川枫长发 个\n@球场 扣篮', prompt_media_ids: ['a', 'b'],
        keyframes: {points: [{description: '// old shot\nClose-up'}]}}]}]};
const generation = {keyframe_runs: [{intervals: [{prompt: '// old\nDunk'}]}]};
const original = JSON.stringify(project);
const result = cleanRunPrompts(project, generation);
const clip = result.project.tracks[0].clips[0];
assert.deepEqual(clip.prompt_media_ids, ['b']);
assert.equal(clip.prompt, '@球场 扣篮');
assert.equal(clip.keyframes.points[0].description, 'Close-up');
assert.equal(result.generation.keyframe_runs[0].intervals[0].prompt, 'Dunk');
assert.equal(JSON.stringify(project), original, 'Editor keeps comments and bindings unchanged');
assert.equal(generation.keyframe_runs[0].intervals[0].prompt, '// old\nDunk');
console.log('PASS: run-only comment and reference cleanup preserves editable source');
