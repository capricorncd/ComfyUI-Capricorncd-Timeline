import assert from 'node:assert/strict';
import { TimelineHistory } from '../js/editor/TimelineHistory.js';

let value = 0;
let changed = 0;
const history = new TimelineHistory({
    capture: () => ({ value }),
    restore: async snapshot => { value = snapshot.value; },
    onChange: () => changed++,
});

history.record(); value = 1;
history.record(); value = 2;
await history.undo(); assert.equal(value, 1);
await history.undo(); assert.equal(value, 0);
assert.equal(history.canUndo, false);
await history.redo(); assert.equal(value, 1);
history.record(); value = 3;
assert.equal(history.canRedo, false);

history.clear();
history.begin(); history.commit(false);
assert.equal(history.canUndo, false);
history.begin(); value = 4; value = 5; history.commit(true);
await history.undo(); assert.equal(value, 3);
history.begin(); history.cancel(); history.commit(true);
assert.equal(history.canUndo, false);
history.begin(); history.clear(); history.commit(true);
assert.equal(history.canUndo, false);

value = 0;
for (let i = 0; i < 105; i++) { history.record(); value++; }
for (let i = 0; i < 100; i++) await history.undo();
assert.equal(value, 5);
assert.equal(history.canUndo, false);
assert(changed > 0);

let finish;
let captures = 0;
const delayed = new TimelineHistory({
    capture: () => { captures++; return { value }; },
    restore: () => new Promise(resolve => { finish = resolve; }),
    onChange() {},
});
delayed.record();
const pending = delayed.undo();
const before = captures;
delayed.record(); delayed.begin(); delayed.commit(true);
await delayed.undo(); await delayed.redo();
assert.equal(captures, before);
finish(); await pending;
assert.equal(delayed.canRedo, true);

let fail = true;
const failing = new TimelineHistory({
    capture: () => ({ value }),
    restore: async () => { if (fail) throw new Error('restore failed'); },
    onChange() {},
});
failing.record();
await assert.rejects(failing.undo(), /restore failed/);
fail = false;
await failing.redo();
assert.equal(failing.canUndo, true);
console.log('History: undo/redo, branching, drag grouping, reset, limit, async exclusion and restore failure passed');
