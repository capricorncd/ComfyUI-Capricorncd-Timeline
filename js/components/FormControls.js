/** Native form controls stay in light DOM so labels, form.elements and events keep working. */
class FormControl extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' }).innerHTML = `<style>
            :host { display: block; min-width: 0; color: var(--cat-text, #e4edeb); }
            :host([hidden]) { display: none; }
            slot { display: contents; }
            ::slotted(input), ::slotted(select), ::slotted(textarea) {
                box-sizing: border-box; display: block; width: 100%; min-width: 0;
                min-height: 36px; padding: 8px 12px; margin: 0;
                border: 1px solid var(--cat-border, #34464b); border-radius: 7px;
                background: var(--cat-field, var(--cat-bg, #101619)); color: inherit;
                font: inherit; font-size: calc(var(--cat-font-size, 1rem) * 0.928571); line-height: 1.5;
                transition: border-color 120ms, box-shadow 120ms;
                accent-color: var(--cat-accent, #64d8c5);
            }
            ::slotted(textarea) { min-height: 90px; resize: vertical; }
            ::slotted(:hover) { border-color: var(--cat-dim, #7f979c); }
            ::slotted(:focus-visible) { outline: 2px solid var(--cat-accent, #64d8c5); outline-offset: 2px; }
            ::slotted(:disabled) { opacity: .45; cursor: not-allowed; }
            ::slotted([aria-invalid="true"]) { border-color: var(--cat-danger, #e56676); }
            :host([size="small"]) ::slotted(input), :host([size="small"]) ::slotted(select) { min-height: 28px; padding: 4px 8px; font-size: calc(var(--cat-font-size, 1rem) * 0.857143); }
        </style><slot></slot>`;
    }

    get control() { return this.querySelector('input, select, textarea'); }
    get value() { return this.control?.value ?? ''; }
    set value(value) { if (this.control) this.control.value = value; }
    get disabled() { return this.control?.disabled ?? false; }
    set disabled(value) { if (this.control) this.control.disabled = !!value; }
    focus(options) { this.control?.focus(options); }
    checkValidity() { return this.control?.checkValidity() ?? true; }
    reportValidity() { return this.control?.reportValidity() ?? true; }
}

export class Input extends FormControl {}
export class Select extends FormControl {}
export class Textarea extends FormControl {}
export { Switch } from './Switch.js';
for (const [name, component] of [['cap-input', Input], ['cap-select', Select], ['cap-textarea', Textarea]]) {
    if (!customElements.get(name)) customElements.define(name, component);
}
