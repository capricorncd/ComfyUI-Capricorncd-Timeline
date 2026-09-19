import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../js/cap_seq_to_video.js', import.meta.url), 'utf8');
const listeners = new Map();
const panel = {setStatus(text, state) { this.text = text; this.state = state; }};
const node = {comfyClass: 'CAP_H3VideoGenerator', _stvProgress: panel};
const subgraph = {getNodeById: id => id === 769 ? node : null};
const app = {rootGraph: {getNodeById: id => id === 1 ? {subgraph} : null}};
new Function('app', 'api', 't', source.slice(source.indexOf('const PLAYER_NODES'),
    source.indexOf('function clampWidth')))(app, {addEventListener: (name, fn) => listeners.set(name, fn)}, key => key);
const emit = (name, detail) => listeners.get(name)({detail});
const error = {node_id: '1:769', node_type: 'CAP_H3VideoGenerator',
    exception_message: 'ValueError: SelfLift does not support Motion Context yet.'};
emit('execution_error', error);
assert.equal(panel.state, 'error');
assert.ok(panel.text.includes('h3_error_selflift_context'));
assert.equal(panel.title, error.exception_message);
emit('executing', null);
assert.equal(panel.state, 'error', 'queue completion must preserve the error');
emit('execution_error', {...error, node_type: 'OtherNode', exception_message: 'unrelated'});
assert.ok(panel.text.includes('h3_error_selflift_context'));
emit('execution_error', {...error, exception_message: '<script>unknown failure</script>'});
assert.ok(panel.text.includes('<script>unknown failure</script>'), 'unknown errors are passed to the plain-text status component');
emit('execution_error', {...error, exception_message: 'SelfLift does not support Digital Human audio locking yet.'});
assert.ok(panel.text.includes('h3_error_selflift_digital_human'));
emit('executing', '1:769');
assert.equal(panel.text, '');
assert.equal(panel.title, 'h3_progress_tip');
app.rootGraph.id = 'workflow';
emit('cat_h3_progress', {workflow_id: 'workflow', node_id: '1:769', phase: 'done', percent: 100,
    warnings: [{code: 'missing_context', clip_id: 'b', previous_clip_id: 'a'}]});
assert.equal(panel.state, 'warning', 'completion must retain the independent-generation warning');
assert.ok(panel.text.includes('h3_warning_missing_context'));
emit('cat_h3_progress', {workflow_id: 'workflow', node_id: '1:769', phase: 'prepare', percent: 0, warnings: []});
assert.equal(panel.state, 'info', 'the next normal run clears the warning');
console.log('H3 inline errors: routing, hints, raw errors and retry clearing passed.');
