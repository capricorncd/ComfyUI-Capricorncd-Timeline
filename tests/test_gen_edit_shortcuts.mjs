import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const appSource = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const timelineSource = readFileSync(new URL('../js/timeline/Timeline.js', import.meta.url), 'utf8');
const start = appSource.indexOf('    handleGenEditKey(');
const end = appSource.indexOf('\n    }', start) + 6;
const route = new Function('return ({' + appSource.slice(start, end) + '}).handleGenEditKey')();
const actionStart = timelineSource.indexOf('    this.handleKey = (e) => {');
const actionEnd = timelineSource.indexOf('\n    };', actionStart) + 7;
const calls = [];
const clip = {id: 'selected'};
const sub = {_selected: clip, _selectedIds: new Set([clip.id]),
    getSelectedClips: () => [clip],
    _trimClipAtPlayhead: side => calls.push(side),
    emit: (name, data) => calls.push({name, data}),
    setCurrentTime: time => calls.push(time), _seekMaxTime: () => 12,
    _stepSeekByFrames: frames => calls.push(frames), fps: 24,
    togglePlay: () => calls.push('play')};
new Function(timelineSource.slice(actionStart, actionEnd)).call(sub);
const app = {genEditModal: {hidden: false}, _genEditState: {timeline: sub}, _shortcutModKey: () => ''};
function event(code, extras = {}) {
    return {code, target: {closest: () => null}, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() {}, stopImmediatePropagation() {}, ...extras};
}
for (const [code, expected] of [['KeyQ', 'left'], ['KeyW', 'right'], ['Home', 0], ['End', 12], ['ArrowLeft', -1], ['ArrowRight', 1], ['Space', 'play']]) {
    const e = event(code);
    assert.equal(route.call(app, e), true);
    assert.equal(e.defaultPrevented, true);
    assert.equal(calls.pop(), expected);
}
for (const code of ['Delete', 'Backspace']) {
    route.call(app, event(code));
    assert.deepEqual(calls.pop(), {name: 'clip:delete', data: {clips: [clip], clipIds: ['selected']}});
}
route.call(app, event('KeyQ', {repeat: true}));
assert.equal(route.call(app, event('KeyW', {ctrlKey: true})), false);
assert.equal(route.call(app, event('Delete', {target: {closest: () => ({})}})), false);
assert.equal(calls.length, 0, 'typing, modifiers and held keys do not edit clips');
app._genEditState.merging = true;
route.call(app, event('Delete'));
assert.equal(calls.length, 0, 'merge blocks edits');
console.log('Generated video dialog routes Q/W/Delete and navigation after consuming the DOM event.');
