import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
    const start = source.indexOf(`    ${name}(`);
    return new Function(`return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}}).${name}`)();
}
const removeGaps = method('_removeTrackGaps');
const makeClip = (startTime, duration) => ({ startTime, duration, sourceOffset: 3,
    get endTime() { return this.startTime + this.duration; } });
function run(clips, locked = false) {
    const track = { clips, locked };
    const app = { _timeline: { tracks: [track], _refresh() {} }, undo: [], saved: 0,
        _recordUndo() { this.undo.push(clips.map(c => c.startTime)); },
        _refreshTimelineDuration() {}, _syncSelectedClip() {}, _scheduleProgramPreview() {},
        _saveToWidgets() { this.saved++; } };
    removeGaps.call(app, track);
    return app;
}
const clips = [makeClip(15, 2), makeClip(4, 3), makeClip(9, 4)];
const app = run(clips);
assert.deepEqual(clips.map(c => c.startTime), [11, 4, 7], 'sort by time and keep the leading offset');
assert.deepEqual(clips.map(c => c.duration), [2, 3, 4]);
assert(clips.every(c => c.sourceOffset === 3));
assert.deepEqual(app.undo, [[15, 4, 9]], 'one undo snapshot before changing timing');
assert.equal(app.saved, 1);
assert.equal(run(clips).undo.length, 0, 'already continuous track is a no-op');
assert.equal(run([makeClip(0, 2), makeClip(8, 2)], true).saved, 0);
assert.equal(run([]).saved, 0);
assert.equal(run([makeClip(6, 2)]).saved, 0);
const overlaps = [makeClip(0, 5), makeClip(2, 1), makeClip(10, 2)];
run(overlaps);
assert.deepEqual(overlaps.map(c => c.startTime), [0, 2, 5], 'preserve overlaps while closing genuine empty spans');
console.log('Track menu: gap removal, timing preservation, locks and undo passed');

const trackSource = readFileSync(new URL('../js/timeline/Track.js', import.meta.url), 'utf8');
const start = trackSource.indexOf('  arrangeClips() {');
const arrange = new Function('return ({' + trackSource.slice(start, trackSource.indexOf('\n  }', start) + 4) + '}).arrangeClips')();
const continuous = [makeClip(4,3),makeClip(12,2),makeClip(20,4)];
continuous.forEach(clip=>clip._applyPosition=()=>{});
const automatic = {autoArrange:true,locked:false,clips:continuous};
assert.equal(arrange.call(automatic),true);
assert.deepEqual(continuous.map(c=>c.startTime),[0,3,5]);
continuous[0].duration=5;
arrange.call(automatic);
assert.deepEqual(continuous.map(c=>c.startTime),[0,5,7]);
automatic.clips.splice(1,1);
arrange.call(automatic);
assert.deepEqual(automatic.clips.map(c=>c.startTime),[0,5]);
const single = makeClip(8,2);
single._applyPosition=()=>{};
assert.equal(arrange.call({autoArrange:true,locked:false,clips:[single]}),true);
assert.equal(single.startTime,0,'one clip also starts at zero');
continuous[1].startTime=30;
automatic.autoArrange=false;
assert.equal(arrange.call(automatic),false);
assert.equal(continuous[1].startTime,30);
automatic.autoArrange=true;automatic.locked=true;
assert.equal(arrange.call(automatic),false);
assert(source.includes('autoArrange: row.auto_arrange === true'));
assert(source.includes('auto_arrange: track.autoArrange === true'));
console.log('Auto arrangement: timing edits, removal, disabled/locked tracks and persistence passed');
