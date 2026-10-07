import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    async _stepAiOptimizeClip(delta) {');
const step = new Function(`return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}})._stepAiOptimizeClip`)();
const points = [{time: 0}, {time: 2}, {time: 5}, {time: 10}];
const target = {clip: {id: 'clip'}, start: 0, duration: 10};
const saved = [], selected = [], bound = [];
const app = {aiOptimizeModal: {hidden: false}, _aiOptimizeKeyframe: {target, point: points[0]},
    _onPromptManagerSourceInput() {saved.push(this._aiOptimizeKeyframe.point);},
    _directorKeyframes: {points: () => points, select: (target, point) => selected.push(point)},
    async _bindAiOptimizeToClip(clip) {bound.push(clip);}};
await step.call(app, 1);
assert.equal(app._aiOptimizeKeyframe.point, points[1]);
assert.equal(saved[0], points[0]);
assert.equal(selected[0], points[1]);
assert.equal(bound[0], target.clip);
await step.call(app, -1);
assert.equal(app._aiOptimizeKeyframe.point, points[0]);
await step.call(app, -1);
assert.equal(app._aiOptimizeKeyframe.point, points[2], 'Wrap stays inside the Clip source window');
app.aiOptimizeModal.hidden = true;
await step.call(app, 1);
assert.equal(app._aiOptimizeKeyframe.point, points[2]);
console.log('Keyframe prompt navigation saves current text, selects adjacent points and rebinds the same Clip.');
