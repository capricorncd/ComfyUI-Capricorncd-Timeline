import './FormControls.js';

export class FormRow extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' }).innerHTML = `<style>
            :host { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: calc(var(--cat-font-size, 1rem) * 0.928571); color: var(--cat-text, #e4edeb); }
            :host([hidden]) { display: none; }
            ::slotted(cap-input), ::slotted(cap-select) { width: var(--cap-form-row-control-width, 180px); flex-shrink: 0; }
        </style><slot></slot>`;
    }
}

if (!customElements.get('cap-form-row')) customElements.define('cap-form-row', FormRow);
