import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function method(file, name, bindings = {}) {
    const source = readFileSync(new URL(`../js/timeline/${file}.js`, import.meta.url), 'utf8');
    const start = source.indexOf(`  ${name}(`);
    const end = source.indexOf('\n  }', start) + 4;
    return new Function(...Object.keys(bindings), `return ({${source.slice(start, end)}}).${name}`)(...Object.values(bindings));
}
const constrain = method('Track', '_constrainClip');
const classes = { add() {}, remove() {}, toggle() {} };
for (const occupied of [true, false]) {
    let session;
    const events = [];
    const timeline = {
        pixelsPerSecond: 100, duration: 20, fps: 24,
        _findTrackAtY: () => target,
        _snapMoveToClipEdges: (_, start) => ({start}),
        _alignedClipEdge: () => null, _hideSnapGuide() {},
        emit: (name, detail) => events.push({name, detail}),
    };
    const makeTrack = () => ({ timeline, type: 'video', clips: [],
        el: { appendChild(el) { el.parent = this; } },
        _setDropTarget() {}, _constrainClip: constrain });
    const original = makeTrack(), target = makeTrack();
    target.visible = false;
    if (occupied) target.clips.push({id: 'hidden', startTime: 0, endTime: 10, enabled: false});
    const clip = {id: 'moving', track: original, startTime: 0, duration: 5,
        get endTime() { return this.startTime + this.duration; },
        el: {classList: classes, style: {}}, _snap: value => value, _applyPosition() {}};
    original.clips.push(clip);
    const drag = method('Clip', '_dragMove', {
        bindDragSession: (_, handlers) => { session = handlers; },
        requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    });
    drag.call(clip, {clientX: 20, clientY: 20});
    session.onMove({clientX: 20, clientY: 200});
    session.onEnd();
    assert.equal(clip.track, occupied ? original : target);
    assert.equal(clip.startTime, 0);
    assert.equal(target.clips.length, 1);
    assert.equal(events.some(e => e.name === 'clip:trackchange'), !occupied);
    assert.equal(events.at(-1).detail.moved, !occupied);
    if (occupied) {
        assert.equal(clip.el.parent, original.el);
        assert.equal(constrain.call(target, clip, 2), null);
        assert.equal(constrain.call(target, clip, 10), 10);
    }
}
console.log('Cross-track drop: occupied hidden clips reject drops; empty tracks and adjacent placement remain valid.');
