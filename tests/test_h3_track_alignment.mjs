import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../js/editor/H3TrackAlignment.js', import.meta.url), 'utf8');
const scope = new Function('makeT', 'T', source.replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '')
    + ';return {h3DurationOptions,secondsFrames,applyH3TrackAlignment,h3AlignmentCategory,openH3TrackAlignment};')(() => key => key, key => key);
const {h3DurationOptions,secondsFrames,applyH3TrackAlignment,h3AlignmentCategory,openH3TrackAlignment} = scope;
assert.deepEqual(h3DurationOptions(7.5, 24), {frames:180, down:175, up:192, aligned:false});
assert.equal(secondsFrames(175, 24), '07.07');
assert.equal(secondsFrames(192, 24), '08.00');
assert(h3DurationOptions(8, 24).aligned);
assert.equal(h3DurationOptions(1 / 24, 24).down, null);
for (const fps of [24, 25, 30, 60]) {
    const result = h3DurationOptions(7.5, fps);
    assert.equal((result.up - 5) % 17, 0);
    assert(result.up >= result.frames);
    assert(result.down <= result.frames);
}
const track = {clips: []};
const a = {track, startTime:0, duration:7.5, _applyPosition() {}};
const b = {track, startTime:9, duration:2, _applyPosition() {}};
track.clips = [a, b];
let undo = 0, saved = 0;
const app = {_timeline:{tracks:[track]}, getFps:()=>24, _recordUndo(){undo++;},
    _rememberResourceTiming() {}, _decorateClip() {}, _refreshTimelineDuration() {}, _syncSelectedClip() {},
    _saveToWidgets(){saved++;}, _scheduleProgramPreview() {}};
assert(applyH3TrackAlignment(app, track, [{clip:a, frames:192, process:true}, {clip:b, frames:56, process:false}]));
assert.equal(a.duration, 8);
assert.equal(b.duration, 2);
assert.equal(b.startTime, 9.5, 'Ripple preserves the existing gap');
assert.equal(undo, 1); assert.equal(saved, 1);
track.locked = true;
assert(!applyH3TrackAlignment(app, track, [{clip:a, frames:175, process:true}]));
assert.equal(a.duration, 8);
assert.equal(h3AlignmentCategory(a, {}, 24), 'aligned');
assert.equal(h3AlignmentCategory(b, {}, 24), 'pending');
assert.equal(h3AlignmentCategory(a, {disabled: true}, 24), 'disabled');
track.locked = false;
a.duration = 7.5; a.startTime = 0; b.startTime = 7;
assert(applyH3TrackAlignment(app, track, [{clip:a, frames:192, process:true}]));
assert.equal(b.startTime, 8, 'Alignment also resolves a pre-existing overlap');
assert.equal(b.duration, 2);

class Element extends EventTarget {
    constructor(tag) {super(); this.tag = tag; this.children = []; this.attributes = new Map(); this.classList = {toggle() {}};}
    append(...children) {this.children.push(...children);}
    setAttribute(key, value) {this.attributes.set(key, String(value));}
    getAttribute(key) {return this.attributes.get(key);}
    get childElementCount() {return this.children.length;}
    showModal() {} close() {} remove() {} focus() {}
}
globalThis.document = {createElement: tag => new Element(tag), createTextNode: text => ({text})};
const uiTrack = {name:'Director', clips:[]};
const clip = (id, duration, startTime) => ({id, name:id, duration, startTime, track:uiTrack, _applyPosition() {}});
const pending = clip('pending',7.5,0), aligned = clip('aligned',8,9), disabled = clip('disabled',7.5,18);
uiTrack.clips = [pending, aligned, disabled];
const uiApp = {...app, _timeline:{tracks:[uiTrack]}, _overlay:new Element('overlay'),
    _ensureClipMeta: clip => ({disabled:clip === disabled})};
openH3TrackAlignment(uiApp, uiTrack);
const dialog = uiApp._overlay.children[0], body = dialog.children[1];
const panels = body.children.slice(2);
assert.deepEqual(body.children[1].children.map(tab => tab.textContent), ['pending (1)','aligned (1)','disabled (1)']);
const pendingRow = panels[0].children[0], alignedRow = panels[1].children[0], disabledRow = panels[2].children[0];
assert.equal(alignedRow.children.length, 2, 'Aligned tab lists title and information without controls');
const checkbox = row => row.children[3].children[0].children[0];
assert(checkbox(pendingRow).checked);
assert.equal(checkbox(disabledRow).checked, false);
assert.equal(disabledRow.children[2].value, 'up');
checkbox(pendingRow).checked = false;
checkbox(pendingRow).dispatchEvent(new Event('change'));
assert(pendingRow.children[2].disabled);
checkbox(disabledRow).checked = true;
checkbox(disabledRow).dispatchEvent(new Event('change'));
assert.equal(disabledRow.children[2].disabled, false);
dialog.children[2].children[1].onclick();
assert.equal(pending.duration, 7.5, 'Unchecked Clip duration stays unchanged');
assert.equal(disabled.duration, 8, 'Disabled Clip can be explicitly included without enabling it on the timeline');
console.log('H3 alignment: 17n+5 grid, seconds.frames, skipped Clips, gap-preserving ripple, undo/save and locked track passed.');
