/** Native checkbox preserves labels, form state and keyboard interaction. */
export class Switch extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' }).innerHTML = `<style>
            :host { display: inline-flex; align-items: center; color: var(--cat-text, #e4edeb); }
            :host([hidden]) { display: none; }
            ::slotted(input[type="checkbox"]) {
                appearance: none; box-sizing: border-box; flex: none; margin: 0;
                width: 38px; height: 22px; padding: 0;
                border: 1px solid var(--cat-border, #34464b); border-radius: 20px;
                background: radial-gradient(circle at 10px 50%, #e7eef3 0 7px, transparent 8px) var(--cat-border, #34464b);
                cursor: pointer; transition: background-color 120ms;
            }
            ::slotted(input:checked) {
                background-color: var(--cat-action, #147d73);
                background-image: radial-gradient(circle at 26px 50%, #e7eef3 0 7px, transparent 8px);
                border-color: var(--cat-action, #147d73);
            }
            ::slotted(input:focus-visible) { outline: 2px solid var(--cat-accent, #64d8c5); outline-offset: 2px; }
            ::slotted(input:disabled) { opacity: .45; cursor: not-allowed; }
        </style><slot></slot>`;
        this.shadowRoot.querySelector('slot').addEventListener('slotchange', () => {
            this.control?.setAttribute('role', 'switch');
        });
    }
    get control() { return this.querySelector('input[type="checkbox"]'); }
    get checked() { return this.control?.checked ?? false; }
    set checked(value) { if (this.control) this.control.checked = !!value; }
    get disabled() { return this.control?.disabled ?? false; }
    set disabled(value) { if (this.control) this.control.disabled = !!value; }
    get value() { return this.control?.value ?? ''; }
    set value(value) { if (this.control) this.control.value = value; }
    focus(options) { this.control?.focus(options); }
    checkValidity() { return this.control?.checkValidity() ?? true; }
    reportValidity() { return this.control?.reportValidity() ?? true; }
}
if (!customElements.get('cap-switch')) customElements.define('cap-switch', Switch);
