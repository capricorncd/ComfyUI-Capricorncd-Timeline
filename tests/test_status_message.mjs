import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.HTMLElement = class {
    constructor() { this.attributes = new Map(); this.textContent = ''; }
    attachShadow(options) { this.shadowRoot = { mode: options.mode }; return this.shadowRoot; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
};
const registry = new Map();
globalThis.customElements = { get: name => registry.get(name), define: (name, element) => registry.set(name, element) };
const { StatusMessage } = await import('../js/components/StatusMessage.js');
assert.equal(customElements.get('cap-status-message'), StatusMessage);
const status = new StatusMessage();
assert.equal(status.shadowRoot.mode, 'open');
assert.match(status.shadowRoot.innerHTML, /role="status" aria-live="polite" aria-atomic="true"/);
assert.match(status.shadowRoot.innerHTML, /:host\(\[hidden\]\)/);
assert.match(status.shadowRoot.innerHTML, /white-space: pre-wrap/);
assert.match(status.shadowRoot.innerHTML, /overflow-wrap: anywhere/);
for (const [text, state, expected] of [
    ['Saving…', undefined, 'info'], ['Saved', 'success', 'success'], ['Failed', 'error', 'error'],
    ['Retrying', undefined, 'info'], ['Fallback', 'unknown', 'info'],
    ['<img src=x onerror=alert(1)>\nPlain text', 'success', 'success'],
    ['', 'error', 'error'], [null, undefined, 'info'],
]) {
    status.setStatus(text, state);
    assert.equal(status.textContent, String(text ?? ''));
    assert.equal(status.getAttribute('state'), expected);
    assert.equal(status.hidden, !text);
}
const appSource = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function appMethod(name) {
    const start = appSource.indexOf(`    ${name}(`);
    const end = appSource.indexOf('\n    }', start) + 6;
    return new Function(`return ({${appSource.slice(start, end)}}).${name}`)();
}
const app = { composeStatus: new StatusMessage(), exportDialog: { querySelector: () => newStatus } };
const newStatus = new StatusMessage();
for (const state of ['info', 'success', 'error']) {
    appMethod('_setComposeStatus').call(app, 'Same status', { ok: state === 'success', error: state === 'error' });
    appMethod('_setExportStatus').call(app, 'Same status', state === 'success' ? 'ok' : state);
    assert.equal(app.composeStatus.getAttribute('state'), newStatus.getAttribute('state'));
    assert.equal(app.composeStatus.textContent, newStatus.textContent);
}
appMethod('_setComposeStatus').call(app, 'Error takes priority', { ok: true, error: true });
assert.equal(app.composeStatus.getAttribute('state'), 'error');
appMethod('_setComposeStatus').call(app, '');
appMethod('_setExportStatus').call(app, '');
assert(app.composeStatus.hidden && newStatus.hidden);
assert.equal((appSource.match(/<cap-status-message /g) || []).length, 2);
const css = readFileSync(new URL('../js/cap_timeline_editor.css', import.meta.url), 'utf8');
assert(!/\.cat-te-(export|compose)-status\.is-(error|ok)/.test(css), 'status visuals belong only to the component');
console.log('Status component: registration, text safety, state transitions, visibility and both caller adapters passed');
