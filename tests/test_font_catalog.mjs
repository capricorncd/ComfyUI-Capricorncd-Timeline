import assert from 'node:assert/strict';
import { FontCatalog } from '../js/editor/FontCatalog.js';

let resolve;
let requests = 0;
const events = [];
const catalog = new FontCatalog(() => {
    requests++;
    return new Promise(done => { resolve = done; });
}, loaded => events.push(loaded));
const first = catalog.load();
assert.equal(first, catalog.load());
assert.equal(requests, 1);
assert.deepEqual(catalog.fonts, []);
const fonts = [{ family: 'Arial', path: 'arial.ttf' }];
resolve(fonts);
assert.equal(await first, fonts);
assert.equal(catalog.fonts, fonts);
assert.equal(await catalog.load(), fonts);
assert.equal(requests, 1);
assert.deepEqual(events, [true]);

let failures = 0;
const failedEvents = [];
const failed = new FontCatalog(async () => {
    failures++;
    throw new Error('offline');
}, loaded => failedEvents.push(loaded));
assert.deepEqual(await failed.load(), []);
assert.deepEqual(await failed.load(), []);
assert.equal(failures, 1);
assert.deepEqual(failedEvents, [false]);
assert.equal(catalog.fonts, fonts);
console.log('Font catalog: concurrent load deduplication, cache, failure fallback and instance isolation passed');
