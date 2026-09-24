import './Button.js';
import { iconHtml } from '../cap_icons.js';
import { makeT } from '../cap_i18n.js';
const T = makeT({ zh: { remove: '移除 {label}' }, en: { remove: 'Remove {label}' }, ja: { remove: '{label}を削除' } });

export class Tag extends HTMLElement {
    static observedAttributes = ['closable', 'disabled', 'close-label'];

    constructor() {
        super();
        this.attachShadow({ mode: 'open' }).innerHTML = `<style>
            :host { display: inline-flex; max-width: 100%; vertical-align: middle; }
            :host([hidden]) { display: none; }
            .tag { display: inline-flex; align-items: center; gap: 4px; min-width: 0; padding: 3px 8px;
                border: 1px solid var(--cat-border-soft); border-radius: 6px; background: var(--cat-raised);
                color: var(--cat-text); font-family: inherit; font-size: calc(var(--cat-font-size, 1rem) * 0.857143); line-height: 1.5; }
            :host([variant="accent"]) .tag { background: var(--cat-selected); color: var(--cat-accent); border-color: color-mix(in srgb, var(--cat-accent) 35%, transparent); }
            :host([variant="danger"]) .tag { color: var(--cat-danger, #e56676); }
            :host([disabled]) { opacity: .45; }
            slot { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        </style><span class="tag"><slot></slot><cap-button size="small" shape="square" variant="ghost" hidden>${iconHtml('close', 12)}</cap-button></span>`;
        this.closeButton = this.shadowRoot.querySelector('cap-button');
        this.shadowRoot.querySelector('slot').addEventListener('slotchange', () => this.attributeChangedCallback());
        this.closeButton.addEventListener('click', event => {
            event.stopPropagation();
            if (this.hasAttribute('disabled')) return;
            if (this.dispatchEvent(new CustomEvent('tag-close', { bubbles: true, composed: true, cancelable: true,
                detail: { value: this.value } }))) this.remove();
        });
    }

    get value() { return this.getAttribute('value') ?? this.textContent.trim(); }
    attributeChangedCallback() {
        this.closeButton.hidden = !this.hasAttribute('closable');
        this.closeButton.disabled = this.hasAttribute('disabled');
        this.closeButton.setAttribute('aria-label', this.getAttribute('close-label') || T('remove', { label: this.textContent.trim() }));
    }
    connectedCallback() { this.attributeChangedCallback(); }
}

export class TagGroup extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' }).innerHTML = `<style>
            :host { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
            :host([hidden]) { display: none; }
            :host([nowrap]) { flex-wrap: nowrap; overflow-x: auto; }
            ::slotted(cap-tag) { flex-shrink: 0; max-width: 100%; }
        </style><slot></slot>`;
    }
    connectedCallback() { if (!this.hasAttribute('role')) this.setAttribute('role', 'group'); }
    get values() { return [...this.children].filter(child => child instanceof Tag).map(tag => tag.value); }
}

if (!customElements.get('cap-tag')) customElements.define('cap-tag', Tag);
if (!customElements.get('cap-tag-group')) customElements.define('cap-tag-group', TagGroup);
