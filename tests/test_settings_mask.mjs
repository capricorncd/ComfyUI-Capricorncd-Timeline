import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
let submitted;
const api = { fetchApi: async (url, options) => {
    submitted = JSON.parse(options.body);
    return { ok: true, json: async () => ({ config: { ...submitted, has_key: true } }) };
} };
class Field {
    constructor() { this.value = ''; }
    addEventListener() {}
    reportValidity() { return true; }
}
for (const name of ['BgmSettings', 'VoiceSettings']) {
    const text = readFileSync(new URL(`../js/editor/${name}.js`, import.meta.url), 'utf8');
    const Class = new Function('api', 'T', 'iconHtml', text.slice(text.indexOf('export class')).replace('export class', 'class') + `; return ${name};`)(api, key => key, () => '<svg></svg>');
    const fields = new Map();
    const root = { querySelectorAll() { return []; }, querySelector(key) { if (!fields.has(key)) fields.set(key, new Field()); return fields.get(key); } };
    const ui = name === 'BgmSettings' ? new Class(root) : new Class(root, {});
    ui.fill({});
    assert.equal(ui.field('url').value, '');
    assert.equal(ui.field('api_key').value, '');
    ui.fill({ url: 'http://localhost', has_key: true, timeout_seconds: 300 });
    assert.equal(ui.field('api_key').value, '****');
    await ui.save();
    assert.equal(submitted.api_key, '', 'mask must never replace the stored key');
    ui.field('api_key').value = 'replacement';
    await ui.save();
    assert.equal(submitted.api_key, 'replacement');
}
console.log('Empty configuration fields and masked-key saves passed');
