import './Button.js';
import { iconHtml } from '../cap_icons.js';

export class Disclosure extends HTMLElement {
    static observedAttributes = ['open'];

    constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>
            :host { display: block; min-width: 0; }
            :host([hidden]), [hidden] { display: none; }
            cap-button { display: flex; }
            .arrow { display: inline-flex; flex: none; }
            :host([open]) .arrow { transform: rotate(90deg); }
            .content { padding: 12px 0; }
        </style>
        <cap-button size="regular" align="start" aria-expanded="false">
            <span class="arrow" aria-hidden="true">${iconHtml('chevronRight', 16)}</span>
            <slot name="title"></slot>
        </cap-button>
        <div class="content" hidden><slot></slot></div>`;
        this._trigger = root.querySelector('cap-button');
        this._content = root.querySelector('.content');
        this._trigger.addEventListener('click', () => { this.open = !this.open; });
    }

    get open() { return this.hasAttribute('open'); }
    set open(value) { this.toggleAttribute('open', !!value); }

    attributeChangedCallback() {
        this._trigger.setAttribute('aria-expanded', String(this.open));
        this._content.hidden = !this.open;
    }
}

if (!customElements.get('cap-disclosure')) customElements.define('cap-disclosure', Disclosure);
