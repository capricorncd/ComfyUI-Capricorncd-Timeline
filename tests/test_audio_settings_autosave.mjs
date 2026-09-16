import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/editor/BgmSettings.js', import.meta.url), 'utf8');
const requests = [];
const api = { fetchApi: (url, options) => new Promise(resolve => requests.push({ body: JSON.parse(options.body), resolve })) };
const Settings = new Function('api', 'T', 'iconHtml', source.slice(source.indexOf('export class')).replace('export class', 'class') + '; return BgmSettings;')(api, key => key, () => '<svg></svg>');
class Field {
    value = '';
    events = {};
    addEventListener(type, handler) { this.events[type] = handler; }
    reportValidity() { return true; }
}
const fields = new Map();
const field = name => { if (!fields.has(name)) fields.set(name, new Field()); return fields.get(name); };
const url = field('url');
const root = {
    querySelector: selector => field(selector.match(/"(.*?)"/)[1]),
    querySelectorAll: selector => selector === 'input[data-bgm]' ? [url] : [],
};
const ui = new Settings(root);
ui.fill({ url: 'http://initial', has_key: true });
const tick = () => new Promise(resolve => setImmediate(resolve));
function respond(index, ok = true) {
    requests[index].resolve({ ok, json: async () => ({ config: { ...requests[index].body, has_key: true }, error: 'Save failed' }) });
}
url.value = 'http://first';
url.events.input();
assert.equal(requests.length, 0, 'typing must not save partial input');
url.events.change();
await tick();
url.value = 'http://second';
url.events.input();
url.events.change();
assert.equal(requests.length, 1, 'writes must be serialized');
respond(0);
await tick();
assert.equal(url.value, 'http://second', 'old response must not overwrite newer edits');
assert.equal(requests[1].body.url, 'http://second');
assert.equal(requests[1].body.api_key, '', 'masked key must be preserved');
respond(1);
await ui.saveQueue;
assert.equal(ui.dirty, false);
url.value = 'http://on-close';
url.events.input();
const closing = ui.flush();
await tick();
assert.equal(requests[2].body.url, 'http://on-close');
respond(2, false);
await closing;
assert.equal(ui.dirty, true, 'failed save must retain unsaved edits');
assert.equal(ui.field('status').textContent, 'Save failed');
const retry = ui.flush();
await tick();
respond(3);
await retry;
assert.equal(ui.dirty, false);
console.log('Audio autosave: serialized writes, stale responses, close flush and failure retry passed');
