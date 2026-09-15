import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewSeedValue, workflowPreviewSeed } from '../js/editor/PreviewSeed.js';

const project = {settings: {runtime_only_clip_ids: ['c']}, tracks: [{clips: [{id: 'c', seed: 123}]}]};
const graph = {
    timeline: {class_type: 'CAP_TimelineEditor', inputs: {project_json: JSON.stringify(project)}},
    parser: {class_type: 'CAP_DataJsonClipParser', inputs: {data_json: ['timeline', 3]}},
    h3: {class_type: 'CAP_MiniMaxH3ReferenceToVideo', inputs: {clip_json: ['parser', 14]}},
    noise: {class_type: 'RandomNoise', inputs: {noise_seed: ['h3', 10]}},
    preview: {class_type: 'ModelPreviewOverrideKJ', inputs: {}},
    guider: {class_type: 'BasicGuider', inputs: {model: ['preview', 0]}},
    sample: {class_type: 'SamplerCustomAdvanced', inputs: {noise: ['noise', 0], guider: ['guider', 0]}},
};
const resolve = () => workflowPreviewSeed(graph, 'c', new Set(['preview']));
const compactGraph = {
    timeline: graph.timeline, preview: graph.preview,
    generator: {class_type: 'CAP_H3VideoGenerator', inputs: {model: ['preview', 0], data_json: ['timeline', 3]}},
};
assert.equal(workflowPreviewSeed(compactGraph, 'c', new Set(['preview'])), 123);
assert.equal(workflowPreviewSeed(compactGraph, 'other', new Set(['preview'])), null);
assert.equal(workflowPreviewSeed(compactGraph, 'c', new Set(['unrelated'])), null);
assert.equal(resolve(), 123, 'resolve actual submitted H3 seed through parser and scoped timeline');
graph.noise.inputs.noise_seed = ['parser', 19];
assert.equal(resolve(), 123);
graph.noise.inputs.noise_seed = 0;
assert.equal(resolve(), 0, 'zero is a valid seed');
graph.noise.inputs.noise_seed = ['unknown', 0];
assert.equal(resolve(), null);
graph.noise.inputs.noise_seed = -1;
assert.equal(resolve(), null, 'never claim -1 is a random seed');
graph.noise.inputs.noise_seed = ['h3', 10];
graph.second = {class_type: 'KSampler', inputs: {model: ['preview', 0], seed: 456}};
assert.equal(resolve(), null, 'different pass seeds cannot be reproduced as one clip seed');
graph.second.inputs.seed = 123;
assert.equal(resolve(), 123);
delete graph.second;
graph.upscale = {class_type: 'SamplerCustomAdvanced', inputs: {
    noise: ['noise', 0], guider: ['guider', 0], latent_image: ['sample', 0],
}};
graph.audioModel = {class_type: 'H3FrozenVideoCache', inputs: {model: ['audioLoader', 0]}};
graph.audio = {class_type: 'H3AudioRefineSampler', inputs: {
    model: ['audioModel', 0], latent: ['upscale', 0], positive: ['h3', 0], seed: 456,
}};
assert.equal(resolve(), 123, 'two video passes sharing RandomNoise ignore a separate audio-model seed');
graph.audio.inputs.seed = ['dynamicAudioSeed', 0];
assert.equal(resolve(), 123, 'unknown seed on a separate model does not invalidate video preview');
graph.audioModel.inputs.model = ['preview', 0];
assert.equal(resolve(), null, 'unknown seed on the actual preview model still prevents copying');
graph.audio.inputs.seed = 456;
assert.equal(resolve(), null, 'different seeds on the preview model remain ambiguous');
graph.audio.inputs.seed = 123;
assert.equal(resolve(), 123);
graph.audioModel.inputs.model = ['audioLoader', 0];
graph.otherGuider = {class_type: 'BasicGuider', inputs: {model: ['audioModel', 0], conditioning: ['sample', 0]}};
graph.unrelated = {class_type: 'SamplerCustomAdvanced', inputs: {noise: ['unknown', 0], guider: ['otherGuider', 0]}};
assert.equal(resolve(), 123, 'conditioning dependencies cannot attach an unrelated sampler to preview');
assert.equal(workflowPreviewSeed(graph, 'other', new Set(['preview'])), null);
for (const value of [null, undefined, '', true, -1, 1.5, Infinity, '18446744073709551615']) assert.equal(previewSeedValue(value), null);

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
    const start = source.indexOf(`    ${name}(`);
    return new Function('previewSeedValue', 'T', `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}}).${name}`)(previewSeedValue, key => key);
}
const clip = {id: 'c', track: {locked: false}}, meta = {seed: -1};
const e = {
    _aiOptimizeClipId: 'c', _selClip: clip, _workflowPreview: {clipId: 'c', promptId: 'run', seed: 123, entry: {}},
    _findClipById: id => id === 'c' ? clip : null, _ensureClipMeta: () => meta,
    modelPreviewSeedUseBtn: {}, modelPreviewSeedInput: {value: '-1'}, clipSeedInput: {value: '-1'},
    _recordUndo() { this.undo = {...meta}; }, _saveToWidgets() { this.saved = {...meta}; },
};
for (const name of ['_previewSeedForClip', '_syncPreviewSeedButton', '_usePreviewSeed']) e[name] = method(name);
e._syncPreviewSeedButton();
assert.equal(e.modelPreviewSeedUseBtn.disabled, false);
assert.equal(meta.seed, -1, 'showing preview does not overwrite the clip seed');
e._usePreviewSeed();
assert.equal(meta.seed, 123);
assert.equal(e.undo.seed, -1);
assert.equal(e.saved.seed, 123);
assert.equal(e.modelPreviewSeedInput.value, '123');
assert.equal(e.clipSeedInput.value, '123');
clip.track.locked = true;
e._workflowPreview.seed = 456;
e._usePreviewSeed();
assert.equal(meta.seed, 123, 'locked clips are unchanged');
clip.track.locked = false;
e._workflowPreview.clipId = 'old';
assert.equal(e._previewSeedForClip(), null, 'cannot copy another clip preview');
e._workflowPreview.clipId = 'c';
e._workflowPreview.entry = null;
assert.equal(e._previewSeedForClip(), null, 'queued run without a preview is not eligible');
e._workflowPreview = null;
e._modelPreviewEntry = {clipId: 'c'};
e._standalonePreviewSeed = 789;
assert.equal(e._previewSeedForClip(), 789);
e._modelPreviewEntry.seed = 987;
assert.equal(e._previewSeedForClip(), 987, 'completed standalone output owns its seed');

// Exercise the real queue hook: randomize only the final API snapshot.
let submitted;
const session = {clipId: 'c', active: true};
const originalProject = JSON.stringify({...project, tracks: [{clips: [{id: 'c', seed: -1}]}]});
const editor = {
    _workflowPreview: session, _timelineReady: true, _timeline: {},
    _randomClipSeed: () => 321,
    _writeProjectJson(raw) { this.widget = raw; },
    _saveToWidgets() { this.widget = originalProject; },
};
const Editor = {_clipRunEditor: editor, _clipRunJobs: [{clipId: 'c', projectJson: originalProject, workflowPreview: session}]};
const app = {async graphToPrompt() {
    editor._saveToWidgets(); // ComfyUI's serialize hook flushes editor widgets.
    submitted = JSON.parse(editor.widget);
    return {output: {...graph, timeline: {class_type: 'CAP_TimelineEditor', inputs: {project_json: editor.widget}}}};
}};
const start = source.indexOf('    static _installClipRunJobHook(');
const hook = source.slice(start, source.indexOf('\n    }', start) + 6).replace('static ', '');
new Function('app', 'api', 'CapTimelineEditorApp', 'previewSeedValue', 'workflowPreviewSeed',
    `return ({${hook}})._installClipRunJobHook()`)(app, {}, Editor, previewSeedValue, workflowPreviewSeed);
const result = await app.graphToPrompt();
assert.equal(submitted.tracks[0].clips[0].seed, -1, 'serialized workflow retains the user setting');
assert.equal(JSON.parse(result.output.timeline.inputs.project_json).tracks[0].clips[0].seed, 321);
assert.equal(session.seed, 321);
assert.equal(editor.widget, originalProject, 'project widget restored after submission');
console.log('PASS: preview seed provenance, runtime-only randomization, explicit apply, undo, locks and stale preview guards');
