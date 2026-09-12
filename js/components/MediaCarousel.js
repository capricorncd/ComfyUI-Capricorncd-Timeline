import './Button.js';
import { iconHtml } from '../cap_icons.js';

/** Shared preview frame and navigation; callers own media and editing actions. */
export class MediaCarousel extends HTMLElement {
    static observedAttributes = ['previous-label', 'next-label'];

    constructor() {
        super();
        this.index = 0;
        this.count = 0;
        this.items = [];
        this.mode = 'preview';
        this.editable = false;
        this.labels = {};
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
            <style>
                :host { display: block; flex: 0 0 auto; min-width: 0; }
                :host([hidden]) { display: none; }
                .frame { position: relative; aspect-ratio: 16 / 9; overflow: hidden;
                    border-radius: 6px; background: var(--cat-bg, #101a1e); }
                .stage { position: absolute; inset: 0; }
                ::slotted(*) { width: 100%; height: 100%; box-sizing: border-box; }
                .previous, .next { position: absolute; top: 50%; transform: translateY(-50%); }
                .view { position: absolute; top: 6px; right: 6px; }
                .actions { position: absolute; bottom: 6px; right: 6px; display: flex; gap: 6px; }
                :host([drop-active]) .frame { outline: 2px solid var(--cat-accent, #64d8c5); outline-offset: -2px; }
                .list { position: absolute; inset: 40px 0 0; overflow: auto; padding: 4px; }
                .row { display: flex; gap: 6px; align-items: center; padding: 6px;
                    border: 1px solid transparent; border-radius: 4px; cursor: pointer; }
                .row[aria-selected="true"] { background: var(--cat-bg-active, #29484b); border-color: var(--cat-accent, #64d8c5); }
                .row:focus-visible { outline: 2px solid var(--cat-accent, #64d8c5); outline-offset: -2px; }
                .row.drop-target { border-top: 2px solid var(--cat-accent, #64d8c5); }
                .thumb { width: 56px; height: 32px; object-fit: contain; flex-shrink: 0; }
                .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
                .disabled .thumb, .disabled .name { opacity: .45; filter: grayscale(1); }
                .empty { padding: 8px; font-size: 12px; color: var(--cat-muted, #a5b5b7); }
                .previous { left: 6px; }
                .next { right: 6px; }
                .count { position: absolute; bottom: 0; left: 0; padding: 4px 6px;
                    color: white; background: rgb(0 0 0 / 45%); font: 11px monospace;
                    pointer-events: none; }
                [hidden] { display: none; }
            </style>
            <div class="frame">
                <div class="stage"><slot></slot></div>
                <cap-button shape="square" class="previous" hidden>${iconHtml('chevronLeft', 24)}</cap-button>
                <cap-button shape="square" class="next" hidden>${iconHtml('chevronRight', 24)}</cap-button>
                <span class="count" aria-live="polite" hidden></span>
                <div class="list" role="listbox" hidden></div>
                <cap-button shape="square" size="small" class="view" hidden></cap-button>
                <div class="actions">
                    <cap-button shape="square" size="small" class="toggle" hidden>${iconHtml('eye', 16)}</cap-button>
                    <cap-button variant="danger" shape="square" size="small" class="remove" hidden>${iconHtml('trash', 16)}</cap-button>
                </div>
            </div>`;
        this._previous = root.querySelector('.previous');
        this._next = root.querySelector('.next');
        this._counter = root.querySelector('.count');
        this._list = root.querySelector('.list');
        this._view = root.querySelector('.view');
        this._remove = root.querySelector('.remove');
        this._toggle = root.querySelector('.toggle');
        this._toggle.addEventListener('click', event => {
            event.stopPropagation();
            if (this.index >= 0) this._request('toggle', { index: this.index });
        });
        this._remove.addEventListener('click', event => {
            event.stopPropagation();
            if (this.count) this._request('delete', { index: this.index });
        });
        this._view.addEventListener('click', event => {
            event.stopPropagation();
            this.setMode(this.mode === 'preview' ? 'list' : 'preview');
        });
        this._previous.addEventListener('click', event => { event.stopPropagation(); this.step(-1); });
        this._next.addEventListener('click', event => { event.stopPropagation(); this.step(1); });
        this.attributeChangedCallback();
    }

    attributeChangedCallback() {
        for (const [button, attribute, fallback] of [
            [this._previous, 'previous-label', 'Previous'], [this._next, 'next-label', 'Next'],
        ]) {
            const label = this.getAttribute(attribute) || fallback;
            button.title = label;
            button.setAttribute('aria-label', label);
        }
    }

    setSelection(index, count) {
        this.count = Math.max(0, Math.trunc(count) || 0);
        this.index = Math.max(0, Math.min(Math.trunc(index) || 0, this.count - 1));
        const indices = this._navigationIndices();
        if (this.mode === 'preview' && this.count && !indices.includes(this.index)) {
            this.index = indices.find(i => i >= this.index) ?? indices[0] ?? -1;
        }
        this._previous.hidden = this._next.hidden = this.mode === 'list' || indices.length < 2;
        this._counter.hidden = this.mode === 'list' || !indices.length;
        this._counter.textContent = indices.length ? `${indices.indexOf(this.index) + 1}/${indices.length}` : '';
        this._remove.hidden = this._toggle.hidden = this.mode === 'list' || !indices.length || this._view.hidden;
        this._remove.disabled = this._toggle.disabled = !this.editable;
        for (const [i, row] of [...this._list.children].entries()) {
            row.setAttribute('aria-selected', String(i === this.index));
        }
    }

    setItems(items, { index = 0, editable = false, labels = {}, allowList = true } = {}) {
        this.items = items;
        this.editable = editable;
        this.labels = labels;
        this._view.hidden = !allowList;
        if (!allowList) this.mode = 'preview';
        this.setSelection(index, items.length);
        this._updateMode();
    }

    setMode(mode) {
        this.mode = mode === 'list' ? 'list' : 'preview';
        this._updateMode();
        this.dispatchEvent(new CustomEvent('media-view-change', { detail: { mode: this.mode }, bubbles: true, composed: true }));
    }

    _updateMode() {
        const list = this.mode === 'list';
        this.shadowRoot.querySelector('.stage').hidden = list;
        this._list.hidden = !list;
        this._view.innerHTML = iconHtml(list ? 'image' : 'list', 16);
        this._view.title = list ? (this.labels.preview || 'Full-width preview') : (this.labels.list || 'Resource list');
        this._view.setAttribute('aria-label', this._view.title);
        this._remove.title = this.labels.remove || 'Remove from Clip';
        this._remove.setAttribute('aria-label', this._remove.title);
        this._toggle.title = this.labels.disable || 'Disable';
        this._toggle.setAttribute('aria-label', this._toggle.title);
        this._list.setAttribute('aria-label', this.labels.list || 'Resource list');
        this.setSelection(this.index, this.count);
        if (list) this._renderList();
        else this._list.replaceChildren();
    }

    _request(action, detail) {
        if (!this.editable) return;
        this.dispatchEvent(new CustomEvent('media-edit', { detail: { action, ...detail }, bubbles: true, composed: true }));
    }

    _renderList() {
        const scroll = this._list.scrollTop;
        const active = this.shadowRoot.activeElement;
        const focusRow = active?.closest('.row');
        const focusAction = active?.dataset.action;
        const focusIndex = focusAction ? Number(focusRow?.dataset.index) : this.index;
        this._list.replaceChildren();
        if (!this.items.length) {
            const empty = document.createElement('div');
            empty.className = 'empty';
            empty.textContent = this.labels.empty || 'No resources';
            this._list.append(empty);
        }
        this.items.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = `row${item.enabled === false ? ' disabled' : ''}`;
            row.dataset.index = String(index);
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', String(index === this.index));
            row.tabIndex = 0;
            row.draggable = this.editable;
            const thumb = document.createElement(item.kind === 'video' ? 'video' : item.kind === 'audio' ? 'span' : 'img');
            thumb.className = 'thumb';
            thumb.draggable = false;
            if (item.kind === 'audio') thumb.innerHTML = iconHtml('audio', 24);
            else thumb.src = item.url;
            if (item.kind === 'video') { thumb.muted = true; thumb.preload = 'metadata'; thumb.playsInline = true; }
            const name = document.createElement('span');
            name.className = 'name';
            name.textContent = `${index + 1}. ${item.name}`;
            name.title = item.name;
            row.append(thumb, name);
            const select = () => {
                this.setSelection(index, this.count);
                this.dispatchEvent(new CustomEvent('media-change', { detail: { index }, bubbles: true, composed: true }));
            };
            row.addEventListener('click', select);
            row.addEventListener('keydown', event => {
                if (event.target !== row) return;
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); select(); }
                if (event.key === 'Delete' || event.key === 'Backspace') {
                    event.preventDefault(); event.stopPropagation();
                    this._request('delete', { index });
                }
                if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
                    event.preventDefault(); event.stopPropagation();
                    const to = index + (event.key === 'ArrowUp' ? -1 : 1);
                    if (to >= 0 && to < this.count) this._request('reorder', { from: index, to });
                }
            });
            for (const [action, icon, label] of [
                ['toggle', item.enabled === false ? 'eyeOff' : 'eye', item.enabled === false ? this.labels.enable : this.labels.disable],
                ['delete', 'trash', this.labels.remove],
            ]) {
                const button = document.createElement('cap-button');
                button.setAttribute('shape', 'square'); button.setAttribute('size', 'small');
                if (action === 'delete') button.setAttribute('variant', 'danger');
                button.title = label || action;
                button.setAttribute('aria-label', button.title);
                button.dataset.action = action;
                button.disabled = !this.editable;
                button.innerHTML = iconHtml(icon, 16);
                button.addEventListener('click', event => { event.stopPropagation(); this._request(action, { index }); });
                row.append(button);
            }
            row.addEventListener('dragstart', event => {
                if (!this.editable || event.composedPath().some(el => el.localName === 'cap-button')) { event.preventDefault(); return; }
                this._dragIndex = index;
                event.stopPropagation();
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(index));
            });
            row.addEventListener('dragover', event => {
                if (!this.editable || this._dragIndex == null) return;
                event.preventDefault(); event.stopPropagation();
                event.dataTransfer.dropEffect = 'move';
                row.classList.add('drop-target');
                const bounds = this._list.getBoundingClientRect();
                if (event.clientY < bounds.top + 24) this._list.scrollTop -= 12;
                if (event.clientY > bounds.bottom - 24) this._list.scrollTop += 12;
            });
            row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
            row.addEventListener('dragend', () => {
                this._dragIndex = null;
                this._list.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
            });
            row.addEventListener('drop', event => {
                if (this._dragIndex == null) return;
                event.preventDefault(); event.stopPropagation();
                const from = this._dragIndex;
                this._dragIndex = null;
                row.classList.remove('drop-target');
                if (from !== index) this._request('reorder', { from, to: index });
            });
            this._list.append(row);
        });
        this._list.scrollTop = scroll;
        if (focusRow) {
            const row = this._list.querySelectorAll('.row')[Math.min(focusIndex, this.items.length - 1)];
            const target = focusAction ? row?.querySelector(`[data-action="${focusAction}"]`) : row;
            target?.focus({ preventScroll: true });
        }
    }

    _navigationIndices() {
        return Array.from({ length: this.count }, (_, i) => i)
            .filter(i => this.mode === 'list' || this.items[i]?.enabled !== false);
    }

    step(delta) {
        const indices = this._navigationIndices();
        if (indices.length < 2) return;
        const position = indices.indexOf(this.index);
        this.setSelection(indices[(position + delta + indices.length) % indices.length], this.count);
        this.dispatchEvent(new CustomEvent('media-change', { detail: { index: this.index }, bubbles: true, composed: true }));
    }
}

if (!customElements.get('cap-media-carousel')) customElements.define('cap-media-carousel', MediaCarousel);
