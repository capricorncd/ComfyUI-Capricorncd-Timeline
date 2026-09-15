import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../js/timeline/Timeline.js', import.meta.url), 'utf8');
let drag, id = 0, time = 0;
const frames = new Map(), listeners = new Map();
const window = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener(name, fn) {if (listeners.get(name) === fn) listeners.delete(name);},
};
const deps = {window, clamp: (v, lo, hi) => Math.min(Math.max(v, lo), hi),
    requestAnimationFrame(fn) {frames.set(++id, fn); return id;},
    cancelAnimationFrame: key => frames.delete(key),
    bindDragSession(e, handlers) {drag = handlers; return () => {drag = null; handlers.onEnd();};},
};
function method(name) {
    const start = source.indexOf(`  ${name}(`);
    return new Function(...Object.keys(deps), `return ({${source.slice(start, source.indexOf('\n  }', start) + 4)}}).${name}`)(...Object.values(deps));
}
function timeline(width = 500, content = 2000) {
    const tl = {pixelsPerSecond: 100, currentTime: 0, _endSeekScrub: null,
        scrollEl: {clientWidth: width, scrollWidth: content, scrollLeft: 0,
            getBoundingClientRect: () => ({left: 100})},
        _seekMaxTime: () => content / 100,
        _snapSeekToClipEdges(value) {this.snapCalls = (this.snapCalls || 0) + 1; return value;},
        clientXToTime(x) {return Math.max(0, Math.min(this._seekMaxTime(), (x - 100 + this.scrollEl.scrollLeft) / 100));},
        setCurrentTime(value) {this.currentTime = value;},
    };
    for (const name of ['_beginSeekScrub', '_seekFromEvent']) tl[name] = method(name);
    return tl;
}
const start = tl => tl._beginSeekScrub({button: 0, clientX: 300, preventDefault() {}});
const frame = () => {
    time += 1000 / 60;
    const queued = [...frames.values()]; frames.clear(); queued.forEach(fn => fn(time));
};
function visible(tl) {
    const x = tl.currentTime * tl.pixelsPerSecond - tl.scrollEl.scrollLeft;
    assert(x >= -1e-7 && x <= tl.scrollEl.clientWidth + 1e-7, `seek outside viewport: ${x}`);
}

const tl = timeline();
start(tl);
drag.onMove({clientX: 700}); // Beyond the right viewport edge at 600.
visible(tl);
frame(); assert(tl.scrollEl.scrollLeft > 0);
const first = tl.scrollEl.scrollLeft;
for (let n = 0; n < 12; n++) {frame(); visible(tl);}
assert(tl.scrollEl.scrollLeft > first, 'stationary pointer outside the edge keeps scrolling');
drag.onMove({clientX: 350});
const inside = tl.scrollEl.scrollLeft;
frame(); frame();
assert.equal(tl.scrollEl.scrollLeft, inside, 'returning inside stops automatic scrolling');
assert.equal(frames.size, 0);

drag.onMove({clientX: 700});
for (let n = 0; n < 200; n++) frame();
assert.equal(tl.scrollEl.scrollLeft, 1500);
assert.equal(tl.currentTime, 20, 'can reach the exact timeline end');
assert.equal(frames.size, 0, 'no animation loop at the scroll limit');
drag.onMove({clientX: 20});
for (let n = 0; n < 200; n++) {frame(); visible(tl);}
assert.equal(tl.scrollEl.scrollLeft, 0);
assert.equal(tl.currentTime, 0);
assert(tl.snapCalls > 0, 'retain seek edge snapping');

drag.onMove({clientX: 700}); frame();
tl._endSeekScrub();
assert.equal(frames.size, 0);
assert.equal(tl._endSeekScrub, null);
assert(!listeners.has('blur'));
const stopped = tl.scrollEl.scrollLeft; frame();
assert.equal(tl.scrollEl.scrollLeft, stopped, 'release stops pending scrolling');
start(tl); drag.onMove({clientX: 700});
listeners.get('blur')();
assert.equal(frames.size, 0, 'window blur cleans up drag and scrolling');
assert.equal(drag, null);

const short = timeline(500, 500);
start(short); drag.onMove({clientX: 700}); frame();
assert.equal(short.scrollEl.scrollLeft, 0);
assert.equal(frames.size, 0, 'no scrolling needed for a fully visible timeline');
short._endSeekScrub();

const destroyStart = source.indexOf('  destroy() {');
assert(source.slice(destroyStart).includes('this._endSeekScrub?.()'), 'teardown stops active drag');
const playhead = readFileSync(new URL('../js/timeline/PlayHead.js', import.meta.url), 'utf8');
assert(playhead.includes('this.timeline._beginSeekScrub(e)'), 'head and ruler share scrubbing behavior');
console.log('PASS: seek edge auto-scroll, stationary pointer, viewport visibility, bounds, snapping and drag cleanup');
