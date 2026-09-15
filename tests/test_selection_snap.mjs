import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../js/timeline/Timeline.js', import.meta.url), 'utf8');
const snapPx = Number(source.match(/const SNAP_EDGE_PX = (\d+)/)[1]);
let session;
function method(name) {
    const start = source.indexOf(`  ${name}(`);
    assert(start >= 0, name);
    return new Function('bindDragSession', 'clamp', 'SNAP_EDGE_PX', 'el',
        `return ({${source.slice(start, source.indexOf('\n  }', start) + 4)}}).${name}`)(
        (_, handlers) => {session = handlers;}, (v, lo, hi) => Math.min(Math.max(v, lo), hi), snapPx,
        () => ({style: {}, hidden: false}));
}
function setup(starts = [1, 4], targets = [6], pps = 100) {
    session = null;
    const tl = {duration: 30, fps: 25, pixelsPerSecond: pps, currentTime: 0,
        tracks: [], events: [], _contentEl: {appendChild() {}},
        emit(type, data) {this.events.push([type, data]);}, selectClip() {},
        expandClipGroups: clips => clips};
    let id = 0;
    const add = (start, duration, track = null) => {
        if (!track) {track = {clips: [], locked: false}; tl.tracks.push(track);}
        const clip = {id: `c${id++}`, startTime: start, duration, track, sourceOffset: 0.4,
            get endTime() {return this.startTime + this.duration;}, _applyPosition() {},
            el: {classList: {add() {}, remove() {}}}};
        track.clips.push(clip);
        return clip;
    };
    const clips = starts.map(start => add(start, 1));
    targets.forEach(start => add(start, 0.6));
    tl.getSelectedClips = () => clips;
    for (const name of ['_snapTime', '_seekSnapTime', '_clipSnapTimes', '_dragSelectedClips',
        '_showSnapGuide', '_hideSnapGuide']) tl[name] = method(name);
    const start = () => tl._dragSelectedClips({clientX: 100}, clips[0]);
    const move = delta => session.onMove({clientX: 100 + delta * pps});
    return {tl, clips, add, start, move};
}
const close = (a, b) => assert(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

const a = setup();
a.start();
a.move(0.96);
close(a.clips[0].startTime, 2);
close(a.clips[1].startTime, 5);
assert.equal(a.tl._snapGuideEl.style.transform, 'translateX(600px)');
assert.equal(a.tl._snapGuideEl.hidden, false);
a.move(2.36);
assert.equal(a.tl._snapGuideEl.hidden, true, 'moving away hides alignment guide');
close(a.clips[1].startTime - a.clips[0].startTime, 3);
a.clips.forEach(c => {assert.equal(c.duration, 1); assert.equal(c.sourceOffset, 0.4);});
session.onEnd();
assert.equal(a.tl.events.filter(([type]) => type === 'clip:movestart').length, 1);
assert.equal(a.tl.events.filter(([type]) => type === 'clip:moveend').length, 1, 'one move/undo transaction');

const middle = setup([1, 4, 10], [6]);
middle.start(); middle.move(1.96);
assert.deepEqual(middle.clips.map(c => c.startTime), [3, 6, 12], 'internal member edge snaps the entire selection');
session.onEnd();
assert(middle.tl._snapGuideEl.hidden, 'release clears the guide');

const self = setup([1, 1.04], []);
self.start(); self.move(0.04);
close(self.clips[0].startTime, 1.04);
close(self.clips[1].startTime, 1.08);
assert(!self.tl._snapGuideEl || self.tl._snapGuideEl.hidden, 'selected Clips never snap to each other');

for (const pps of [100, 200]) {
    const zoom = setup([1, 4], [6], pps);
    zoom.start(); zoom.move(0.96);
    close(zoom.clips[0].startTime, pps === 100 ? 2 : 1.96);
}

const bounded = setup([1, 4], [7.04]);
bounded.add(4, 1, bounded.clips[0].track);
bounded.start(); bounded.move(2);
assert.deepEqual(bounded.clips.map(c => c.startTime), [3, 6], 'snap cannot cross a same-track obstacle');
assert.equal(bounded.tl._snapGuideEl.style.transform, 'translateX(400px)', 'guide shows reachable boundary, not rejected target');
bounded.move(-100);
close(bounded.clips[0].startTime, 0);
session.onEnd();

const end = setup([1, 4], [30.04]);
end.start(); end.move(100);
close(end.clips[1].endTime, 30);
assert(!end.tl._snapGuideEl || end.tl._snapGuideEl.hidden, 'unreachable out-of-range target has no guide');

const locked = setup();
locked.clips[1].track.locked = true;
locked.start(); assert.equal(session, null);
locked.clips[1].track.locked = false;
locked.start(); locked.move(0.96);
locked.clips[1].track.locked = true;
locked.move(2);
close(locked.clips[0].startTime, 2);
assert(locked.tl._snapGuideEl.hidden);
session.onEnd();

const click = setup();
click.start(); click.move(0.02); session.onEnd();
assert.deepEqual(click.clips.map(c => c.startTime), [1, 4]);
assert.equal(click.tl.events.length, 0, 'click does not move or create an undo entry');
assert.match(readFileSync(new URL('../js/timeline/timeline.css', import.meta.url), 'utf8'), /\.tl-snap-guide\s*\{[^}]*border-left: 1px dashed/s);
console.log('PASS: selection edge snapping, internal members, exclusion, zoom, collisions, bounds, locks, guides and one drag transaction');
