import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../js/editor/H3DraftVersions.js', import.meta.url), 'utf8');
let confirmed = true, confirmations = 0, alerts = 0;
const Manager = new Function('showCapConfirm', 'showCapAlert', 'draftT', 'T',
    source.slice(source.indexOf('export class ')).replace('export class ', 'return class '))(
    async () => { confirmations++; return confirmed; }, () => alerts++, key => key, key => key);
function setup(fail = '') {
    const clip = {id: 'clip', track: {}};
    const rows = [{id: 'first'}, {id: 'second'}, {id: 'outside'}];
    const meta = {h3Drafts: [...rows]};
    const deleted = [];
    const manager = Object.create(Manager.prototype);
    manager.render = manager.stop = () => {};
    manager.editor = {
        _findClipById: id => id === clip.id ? clip : null,
        _ensureClipMeta: () => meta,
        _saveToWidgets() {},
        _recordUndo() { throw Error('File deletion must not create undo'); },
        _confirmDraftRemoval: async () => { confirmations++; return confirmed; },
        _requestH3DraftFiles: async (action, {id}) => {
            assert.equal(action, 'delete');
            if (id === fail) throw Error('Recycle failed');
            deleted.push(id);
        },
    };
    return {manager, clip, rows, meta, deleted};
}
let s = setup();
await s.manager.deleteVersions(s.clip, s.rows.slice(0, 2));
assert.equal(confirmations, 1, 'one confirmation for the batch');
assert.deepEqual(s.deleted, ['first', 'second']);
assert.deepEqual(s.meta.h3Drafts, [{id: 'outside'}], 'versions outside the displayed scope remain');
assert.deepEqual(s.meta.h3DraftRemoved, ['first', 'second']);
assert.deepEqual([...s.manager.editor._deletedH3DraftIds], ['first', 'second']);
confirmed = false;
s = setup();
await s.manager.deleteVersions(s.clip, s.rows);
assert.deepEqual(s.deleted, []);
confirmed = true;
s.clip.track.locked = true;
await s.manager.deleteVersions(s.clip, s.rows);
assert.deepEqual(s.deleted, []);
s = setup('second');
await s.manager.deleteVersions(s.clip, s.rows);
assert.deepEqual(s.deleted, ['first']);
assert.deepEqual(s.meta.h3Drafts.map(row => row.id), ['second', 'outside'], 'failed and unprocessed versions remain linked');
assert.equal(alerts, 1);
s = setup();
await s.manager.deleteVersions(s.clip, [s.rows[0]]);
assert.deepEqual(s.deleted, ['first'], 'single deletion shares the same persistence path');
s = setup();
s.manager.editor._requestH3DraftFiles = async () => { s.manager.editor._openGen = 1; };
await s.manager.deleteVersions(s.clip, s.rows);
assert.deepEqual(s.meta.h3Drafts, s.rows, 'switching projects cannot mutate the new project');
console.log('PASS: batch deletion scope, confirmation, cancellation, locks, partial failure, single deletion and project switching');
