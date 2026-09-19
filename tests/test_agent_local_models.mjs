import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/editor/AgentSettings.js', import.meta.url), 'utf8');
class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.listeners = {}; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.append(child); }
    replaceChildren() { this.children = []; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    setStatus(text, state) { this.textContent = text; this.state = state; }
}
const document = { createElement: tag => new Element(tag) };
let reply = { prompt: 'A sunny forest.' }, ok = true, payload, selected = 'agent:remote';
const AgentSettings = new Function('document', 'api', 'T', 'fetch',
    source.replace(/^import .*;\r?\n/gm, '').replace('export class', 'class') + '\nreturn AgentSettings;')(
    document, { apiURL: value => value }, (key, args) => args?.msg || key,
    async (_url, options) => { payload = JSON.parse(options.body); return { ok, status: ok ? 200 : 500, json: async () => reply }; });
const settings = Object.assign(Object.create(AgentSettings.prototype), {
    localModelList: new Element('div'), _localModels: ['Qwen4B', 'Qwen8B'],
    _localModelTests: new Map(), _localTestAbort: null,
    _getSelectedModel: () => selected,
    _selectModel: async name => { selected = `local:${name}`; },
});
let agentLoads = 0;
settings.agentList = new Element('div');
settings._loadAgents = async () => { agentLoads++; };
settings._loadPromptDirectory = async () => {};
settings._loadLocalModels = () => assert.fail('opening settings must not scan');
await settings.load();
assert.equal(agentLoads, 1);
settings._renderLocalModels();
assert.equal(settings.localModelList.children.length, 2);
assert.equal(settings.localModelList.children[0].children[0].children[1].textContent, 'local_prompt_model_untested');
await settings.localModelList.children[1].children[2].listeners.click();
assert.equal(selected, 'local:Qwen8B');
assert.equal(settings.localModelList.children[1].children[2].attributes['aria-pressed'], 'true');
await settings._testLocalModel('Qwen4B');
assert.equal(payload.model, 'Qwen4B');
assert.deepEqual(payload.files, []);
assert.equal(payload.keep_loaded, false);
assert.equal(settings._localModelTests.get('Qwen4B').state, 'success');
assert.equal(selected, 'local:Qwen8B', 'testing must not change the selected model');
ok = false; reply = { error: 'CUDA out of memory' };
await settings._testLocalModel('Qwen8B');
assert.equal(settings._localModelTests.get('Qwen8B').text, 'CUDA out of memory');
assert.equal(settings._localModelTests.get('Qwen8B').state, 'error');
assert.equal(settings._localTestAbort, null);
ok = true; reply = { prompt: ' ' };
await settings._testLocalModel('Qwen8B');
assert.equal(settings._localModelTests.get('Qwen8B').state, 'error', 'empty output must not pass');
console.log('Local models: selection, untested status, inference test, error details and empty-output rejection passed');
