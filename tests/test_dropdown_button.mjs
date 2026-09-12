import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.HTMLElement = class {
    constructor() { this.attributes = new Map(); this.textContent = ''; this.listeners = {}; }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    attachShadow(options) {
        const button = { attributes: new Map(), disabled: false, clicks: 0,
            setAttribute(name, value) { this.attributes.set(name, value); }, removeAttribute(name) { this.attributes.delete(name); },
            click() { if (!this.disabled) this.clicks++; }, focus(options) { this.focusOptions = options; } };
        this.shadowRoot = { mode: options.mode, querySelector: () => button };
        return this.shadowRoot;
    }
    hasAttribute(name) { return this.attributes.has(name); }
    getAttribute(name) { return this.attributes.get(name); }
    setAttribute(name, value) { this.attributes.set(name, value); this.attributeChangedCallback(name); }
    removeAttribute(name) { this.attributes.delete(name); this.attributeChangedCallback(name); }
    toggleAttribute(name, enabled) {
        if (enabled) this.attributes.set(name, ''); else this.attributes.delete(name);
        this.attributeChangedCallback(name);
    }
};
const registry = new Map();
globalThis.customElements = { get: name => registry.get(name), define: (name, value) => registry.set(name, value) };
const { DropdownButton } = await import('../js/components/DropdownButton.js');
assert.equal(customElements.get('cap-dropdown-button'), DropdownButton);
const trigger = new DropdownButton();
assert.equal(trigger.shadowRoot.mode, 'open');
assert.match(trigger.shadowRoot.innerHTML, /<cap-button aria-haspopup="menu">/);
assert.match(trigger.shadowRoot.innerHTML, /class="caret" aria-hidden="true"/);
assert.equal(trigger.disabled, false);
trigger.click(); assert.equal(trigger._button.clicks, 1);
trigger.disabled = true;
assert(trigger.hasAttribute('disabled') && trigger._button.disabled);
trigger.click(); assert.equal(trigger._button.clicks, 1);
trigger.disabled = false;
trigger.click(); assert.equal(trigger._button.clicks, 2);
trigger.focus({ preventScroll: true });
assert.deepEqual(trigger._button.focusOptions, { preventScroll: true });
trigger.setAttribute('variant', 'amber');
assert.equal(trigger._button.attributes.get('variant'), 'amber');
trigger.removeAttribute('variant');
assert(!trigger._button.attributes.has('variant'));
trigger.setAttribute('aria-label', 'More');
assert.equal(trigger._button.attributes.get('aria-label'), 'More');
const { Button } = await import('../js/components/Button.js');
assert.equal(customElements.get('cap-button'), Button);
const basic = new Button();
assert.match(basic.shadowRoot.innerHTML, /<button type="button"><slot><\/slot><\/button>/);
assert(!basic.shadowRoot.innerHTML.includes('caret'));
basic.setAttribute('aria-haspopup', 'menu');
assert.equal(basic._button.attributes.get('aria-haspopup'), 'menu');
basic.removeAttribute('aria-haspopup');
assert(!basic._button.attributes.has('aria-haspopup'));
basic.setAttribute('aria-label', 'Close');
assert.equal(basic._button.attributes.get('aria-label'), 'Close');
basic.removeAttribute('aria-label');
assert(!basic._button.attributes.has('aria-label'));
basic.setAttribute('aria-pressed', 'true');
assert.equal(basic._button.attributes.get('aria-pressed'), 'true');
basic.setAttribute('aria-pressed', 'false');
assert.equal(basic._button.attributes.get('aria-pressed'), 'false');
basic.disabled = true; basic.click(); assert.equal(basic._button.clicks, 0);
basic.disabled = false; basic.click(); assert.equal(basic._button.clicks, 1);
const app = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const timeline = readFileSync(new URL('../js/timeline/Timeline.js', import.meta.url), 'utf8');
assert.match(timeline, /el\('cap-dropdown-button', 'tl-btn-add-track'\)/);
assert.match(app, /packageBtn = document.createElement\("cap-dropdown-button"\)/);
assert.match(app, /runMenuBtn = document.createElement\("cap-dropdown-button"\)/);
assert.match(app, /moreBtn = document.createElement\("cap-dropdown-button"\)/);
assert.match(app, /moreBtn.bindMenu\(e =>/);
for (const name of ['editModeBtn', 'undoBtn', 'redoBtn']) {
    assert(app.includes(`this.${name} = document.createElement("cap-button")`));
}
assert(!timeline.includes("el('button', 'tl-btn"), 'toolbar controls all use shared buttons');
const css = readFileSync(new URL('../js/timeline/timeline.css', import.meta.url), 'utf8');
assert(!/\.tl-btn[\s.:{\-]/.test(css), 'obsolete button presentation is removed');
assert.match(timeline, /e.target.closest\?\.\('cap-button, cap-dropdown-button'\)\) return/);
assert.match(timeline, /closest\('button, cap-button, cap-dropdown-button,/);
assert.match(app, /<cap-dropdown-button class="cat-te-import">/);
for (const name of ['export', 'compose-open', 'settings', 'header-close']) {
    assert(app.includes(`<cap-button class="cat-te-${name}"`));
}
assert.match(app, /querySelector\(".cat-te-import"\).bindMenu\(e => this._showImportMenu\(e\)\)/);
const translations = readFileSync(new URL('../js/i18n/timeline_editor.js', import.meta.url), 'utf8');
assert(!/insert_clip_btn:.*▾|run_btn_caret|import_btn_caret/.test(translations));
assert.match(app, /packageBtn.bindMenu\(e => this._showInsertClipMenu\(e\)\)/);
assert.match(app, /runMenuBtn.bindMenu\(e => this._showRunMenu\(e\)\)/);
assert.match(app, /neu.bindMenu\(e => this._showAddTrackMenu\(e\)\)/);
const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
const timers = new Map(); let timerId = 0;
globalThis.setTimeout = (fn, delay) => { assert.equal(delay, 180); timers.set(++timerId, fn); return timerId; };
globalThis.clearTimeout = id => timers.delete(id);
const flush = () => { const jobs = [...timers.values()]; timers.clear(); jobs.forEach(fn => fn()); };
try {
    let opened = 0, currentMenu;
    const menu = () => ({ isConnected: true, listeners: {},
        addEventListener(name, fn) { this.listeners[name] = fn; },
        remove() { this.isConnected = false; },
    });
    const hover = new DropdownButton();
    hover.bindMenu(() => { opened++; currentMenu = menu(); return currentMenu; });
    hover.listeners.pointerenter({ pointerType: 'touch' }); assert.equal(opened, 0);
    hover.disabled = true;
    hover.listeners.pointerenter({ pointerType: 'mouse' }); assert.equal(opened, 0);
    hover.disabled = false;
    hover.listeners.pointerenter({ pointerType: 'mouse' }); assert.equal(opened, 1);
    hover.listeners.click({ stopPropagation() {} }); assert.equal(opened, 1, 'click on an open hover menu does not rebuild it');
    hover.listeners.pointerleave(); assert(currentMenu.isConnected);
    currentMenu.listeners.pointerenter(); flush(); assert(currentMenu.isConnected, 'crossing the button-menu gap does not close it');
    currentMenu.listeners.pointerleave(); flush(); assert(!currentMenu.isConnected);
    hover.listeners.click({ stopPropagation() {} }); assert.equal(opened, 2, 'click/keyboard fallback remains available');
    hover.disabled = true; assert(!currentMenu.isConnected);
    hover.disabled = false;
    hover.listeners.pointerenter({ pointerType: 'mouse' });
    const old = currentMenu;
    hover.listeners.pointerleave();
    const other = new DropdownButton();
    other.bindMenu(() => { currentMenu.remove(); currentMenu = menu(); return currentMenu; });
    other.listeners.pointerenter({ pointerType: 'mouse' });
    flush(); assert(!old.isConnected && currentMenu.isConnected, 'old hide timers cannot close a different menu');
    other.listeners.pointerleave(); other.disconnectedCallback();
    assert.equal(timers.size, 0); assert(!currentMenu.isConnected);
} finally {
    globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout;
}
{
    const start = app.indexOf('    _showAddTrackMenu('), end = app.indexOf('\n    }', start) + 6;
    const show = new Function('T', `return ({${app.slice(start, end)}})._showAddTrackMenu`)(key => key);
    let undo = 0, added, items;
    const owner = { _recordUndo() { undo++; }, _addUserTrack(type) { added = type; },
        _buildCtxMenu(rows) { items = rows; return 'menu'; } };
    assert.equal(show.call(owner, { currentTarget: { getBoundingClientRect: () => ({ left: 0, bottom: 10 }) } }), 'menu');
    assert.equal(undo, 0, 'hover must not create undo history');
    items[0].fn(); assert.equal(undo, 1); assert.equal(added, 'text');
}
{
    const start = app.indexOf('    _showImportMenu('), end = app.indexOf('\n    }', start) + 6;
    const show = new Function('T', `return ({${app.slice(start, end)}})._showImportMenu`)(key => key);
    let rows, imported;
    const owner = {
        _buildCtxMenu(items, x, y, options) {
            rows = items; assert.deepEqual([x, y], [12, 32]);
            assert.equal(options.ignoreNextClick, false); return 'import-menu';
        },
        _importFromDirectory() { imported = 'directory'; },
        _chooseZipImport() { imported = 'zip'; },
    };
    assert.equal(show.call(owner, { currentTarget: { getBoundingClientRect: () => ({ left: 12, bottom: 28 }) } }), 'import-menu');
    assert.equal(imported, undefined);
    rows[0].fn(); assert.equal(imported, 'directory');
    rows[1].fn(); assert.equal(imported, 'zip');
}
{
    const start = app.indexOf('    _updateEditModeToolbar('), end = app.indexOf('\n    }', start) + 6;
    const update = new Function('T', 'iconHtml', `return ({${app.slice(start, end)}})._updateEditModeToolbar`)(key => key, name => name);
    const mode = new Button(); let active = false, targets = [];
    const owner = { editModeBtn: mode, _allGeneratedPreviewActive: () => active, _clipsWithEnabledGeneratedVideo: () => targets };
    update.call(owner);
    assert(mode.disabled); assert.equal(mode.getAttribute('aria-pressed'), 'false');
    targets = ['clip']; active = true; update.call(owner);
    assert(!mode.disabled); assert.equal(mode.getAttribute('aria-pressed'), 'true');
    assert.equal(mode.getAttribute('aria-label'), 'edit_mode_back_to_resource_title');
    active = false; update.call(owner);
    assert.equal(mode.getAttribute('aria-pressed'), 'false');
    assert.equal(mode.getAttribute('aria-label'), 'edit_mode_switch_to_generated_title');
}
console.log('Dropdown button: shared trigger, fixed caret, native disabled/focus behavior and timeline/header integration passed');
