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
let fetchResult = null;
let reply = { prompt: 'A sunny forest.' }, ok = true, payload, selected = 'agent:remote';
const AgentSettings = new Function('document', 'api', 'T', 'fetch',
    source.replace(/^import .*;\r?\n/gm, '').replace('export class', 'class') + '\nreturn AgentSettings;')(
    document, { apiURL: value => value }, (key, args) => args?.msg || key,
    async (_url, options) => { payload = JSON.parse(options.body); return fetchResult || { ok, status: ok ? 200 : 500, json: async () => reply }; });
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

const addressLabel = {}, modelListLabel = {};
const serviceModelSelect = new Element('select');
serviceModelSelect.closest = () => modelListLabel;
Object.assign(settings, {
    agentForm: {}, agentLabelInput: {value: '', focus() {}}, agentProviderSelect: {value: ''},
    agentBaseUrlInput: {value: '', closest: () => addressLabel}, agentLocalHint: {},
    serviceModelSelect, serviceModelsStatus: new Element('status'), serviceModelsRefresh: {},
    agentModelInput: {value: ''}, agentKeyInput: {value: ''}, agentEnabledCb: {}, agentDeleteBtn: {},
});
settings.edit({id: 'local', provider: 'ollama', model: 'qwen3:8b', label: 'Ollama', base_url: 'http://localhost:11434/v1'});
assert.equal(addressLabel.hidden, false);
assert.equal(settings.agentLocalHint.hidden, false);
assert.equal(settings.agentKeyInput.placeholder, 'agent_api_key_optional');
assert.equal(settings.agentBaseUrlInput.value, 'http://localhost:11434/v1');
reply = {agents: []};
await settings.save();
assert.equal(payload.provider, 'ollama');
assert.equal(payload.api_key, '');
assert.equal(payload.model, 'qwen3:8b');
assert.equal(payload.base_url, 'http://localhost:11434/v1');
settings.edit({id: 'cloud', provider: 'openai', has_key: true, label: 'Cloud', model: 'existing'});
assert.equal(addressLabel.hidden, true);
assert.equal(settings.agentLocalHint.hidden, true);
assert.equal(settings.agentKeyInput.placeholder, 'leave_blank_keep_key');
await settings.save();
assert.equal(payload.api_key, '', 'editing never sends the masked key');
settings.edit();
settings.agentProviderSelect.value = 'openai_compatible';
settings._updateProvider();
assert.equal(addressLabel.hidden, false);
assert.equal(settings.agentBaseUrlInput.placeholder, 'http://localhost:1234/v1');
settings._agentConfigs = [{provider: 'ollama', label: 'Local', model: 'qwen3:8b', enabled: true}];
settings._render();
assert.match(settings.agentList.children[0].children[0].children[1].textContent, /Ollama/);
console.log('Local services: provider fields, optional keys, save payload and provider labels passed');

settings._editingAgentId = 'existing';
settings.agentProviderSelect.value = 'ollama';
settings.agentBaseUrlInput.value = 'http://localhost:11434/v1';
settings.agentKeyInput.value = '****';
settings.agentModelInput.value = 'qwen3:8b';
reply = {models: ['gemma', 'qwen3:8b']};
await settings._loadServiceModels();
assert.equal(payload.api_key, '', 'masked credentials are never sent as a real key');
assert.equal(payload.id, 'existing');
assert.equal(payload.base_url, 'http://localhost:11434/v1');
assert.equal(serviceModelSelect.children.length, 3);
assert.equal(serviceModelSelect.value, 'qwen3:8b');
assert.equal(modelListLabel.hidden, false);
assert.equal(settings.serviceModelsRefresh.disabled, false);
reply = {models: []};
await settings._loadServiceModels();
assert.equal(modelListLabel.hidden, true);
assert.equal(settings.agentModelInput.value, 'qwen3:8b', 'empty lists preserve manual model names');
assert.equal(settings.serviceModelsStatus.textContent, 'agent_models_empty');
ok = false; reply = {error: 'Connection refused'};
await settings._loadServiceModels();
assert.equal(settings.serviceModelsStatus.state, 'error');
assert.equal(settings.serviceModelsStatus.textContent, 'Connection refused');
assert.equal(settings.serviceModelsRefresh.disabled, false);
ok = true;
settings.agentProviderSelect.value = 'openai';
settings._updateProvider();
assert.equal(modelListLabel.hidden, true);
assert.equal(serviceModelSelect.children.length, 0, 'switching providers clears stale model lists');
console.log('Service models: loading, selection preservation, masked keys, empty lists and connection errors passed');

settings.agentProviderSelect.value = 'ollama';
let resolveFetch;
fetchResult = new Promise(resolve => { resolveFetch = resolve; });
const pendingModels = settings._loadServiceModels();
settings.agentProviderSelect.value = 'openai';
settings._updateProvider();
resolveFetch({ok: true, json: async () => ({models: ['stale-model']})});
await pendingModels;
fetchResult = null;
assert.equal(serviceModelSelect.children.length, 0, 'late responses do not populate another provider');

const elements = new Map();
const root = {querySelector(selector) {
    if (!elements.has(selector)) {
        const element = new Element('div');
        element.value = '';
        element.closest = () => ({});
        elements.set(selector, element);
    }
    return elements.get(selector);
}};
const form = new AgentSettings(root, () => {}, {getSelectedModel: () => '', selectModel() {}});
let fetches = 0;
form._loadServiceModels = async () => { fetches++; };
form.agentProviderSelect.value = 'ollama';
form.agentBaseUrlInput.listeners.change();
form.serviceModelsRefresh.listeners.click();
form.agentProviderSelect.listeners.change();
assert.equal(fetches, 3, 'address changes, provider changes and manual refresh fetch models');
form.serviceModelSelect.value = 'gemma:latest';
form.serviceModelSelect.listeners.change();
assert.equal(form.agentModelInput.value, 'gemma:latest');
console.log('Automatic fetching, model selection and stale-response cancellation passed');
