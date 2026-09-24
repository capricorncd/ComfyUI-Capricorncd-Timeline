import { Button } from './Button.js';
import { makeT } from '../cap_i18n.js';
const T = makeT({ zh: { required: '请选择一个选项。' }, en: { required: 'Please select an option.' }, ja: { required: '選択肢を選んでください。' } });

export class RadioButton extends Button {
    static observedAttributes = [...Button.observedAttributes, 'checked'];

    constructor() {
        super();
        this.addEventListener('click', () => {
            if (this.disabled || this._button.disabled) return;
            if (this.parentElement?.localName === 'cap-radio-group') {
                this.dispatchEvent(new CustomEvent('radio-select', { bubbles: true, detail: { value: this.value } }));
            } else if (!this.checked) {
                this.checked = true;
                this.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: this.value } }));
            }
        });
    }

    connectedCallback() {
        this.setAttribute('role', 'radio');
        this.setAttribute('aria-checked', String(this.checked));
        this._button.disabled = this.disabled;
    }
    attributeChangedCallback(name) {
        if (name === 'checked') this.setAttribute('aria-checked', String(this.checked));
        else super.attributeChangedCallback(name);
    }
    get checked() { return this.hasAttribute('checked'); }
    set checked(value) { this.toggleAttribute('checked', !!value); }
    get value() { return this.getAttribute('value') ?? ''; }
    set value(value) { this.setAttribute('value', value); }
    setGroupDisabled(disabled) { this._button.disabled = disabled || this.disabled; }
}

export class RadioGroup extends HTMLElement {
    static formAssociated = true;
    static observedAttributes = ['value', 'disabled', 'required'];

    constructor() {
        super();
        this.internals = this.attachInternals();
        this.attachShadow({ mode: 'open' }).innerHTML = `<style>
            :host { display: flex; flex-wrap: wrap; gap: 8px; }
            :host([hidden]) { display: none; }
            :host([aria-disabled="true"]) { opacity: .45; }
            :host([orientation="vertical"]) { flex-direction: column; align-items: flex-start; }
        </style><slot></slot>`;
        this.shadowRoot.querySelector('slot').addEventListener('slotchange', () => this.sync());
        this.observer = new MutationObserver(() => this.sync());
        this.addEventListener('radio-select', event => {
            if (event.target.parentElement !== this) return;
            event.stopPropagation();
            this.select(event.target);
        });
        this.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || this.disabled) return;
            const radios = this.radios.filter(radio => !radio.disabled);
            if (!radios.length) return;
            event.preventDefault();
            const index = radios.indexOf(event.target);
            const previous = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? radios.length - 1
                : (index + (previous ? -1 : 1) + radios.length) % radios.length;
            this.select(radios[next]);
            radios[next].focus();
        });
    }

    connectedCallback() {
        this.setAttribute('role', 'radiogroup');
        if (this.initialValue === undefined) this.initialValue = this.getAttribute('value') ?? this.radios.find(radio => radio.checked)?.value ?? '';
        if (!this.hasAttribute('value')) this.value = this.initialValue;
        this.observer.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'value'] });
        this.sync();
    }
    disconnectedCallback() { this.observer.disconnect(); }
    attributeChangedCallback() { this.sync(); }
    get radios() { return [...this.children].filter(child => child instanceof RadioButton); }
    get value() { return this.getAttribute('value') ?? ''; }
    set value(value) { if (this.value !== String(value) || !this.hasAttribute('value')) this.setAttribute('value', value); }
    get disabled() { return this.hasAttribute('disabled') || !!this.formDisabled; }
    set disabled(value) { this.toggleAttribute('disabled', !!value); }
    select(radio) {
        if (this.disabled || radio.disabled || this.value === radio.value) return;
        this.value = radio.value;
        this.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: this.value } }));
    }
    sync() {
        const radios = this.radios;
        const selected = radios.find(radio => radio.value === this.value);
        const focusable = selected && !selected.disabled ? selected : radios.find(radio => !radio.disabled);
        for (const radio of radios) {
            radio.checked = radio === selected;
            radio.setGroupDisabled(this.disabled);
            radio.tabIndex = !this.disabled && radio === focusable ? 0 : -1;
        }
        this.setAttribute('aria-disabled', String(this.disabled));
        this.setAttribute('aria-required', String(this.hasAttribute('required')));
        this.internals.setFormValue(!this.disabled && selected && !selected.disabled ? this.value : null);
        const missing = !this.disabled && this.hasAttribute('required') && (!selected || selected.disabled);
        this.internals.setValidity(missing ? { valueMissing: true } : {}, missing ? T('required') : '');
    }
    focus(options) { this.radios.find(radio => radio.tabIndex === 0)?.focus(options); }
    checkValidity() { return this.internals.checkValidity(); }
    reportValidity() { return this.internals.reportValidity(); }
    formResetCallback() { this.value = this.initialValue; }
    formDisabledCallback(disabled) { this.formDisabled = disabled; this.sync(); }
    formStateRestoreCallback(value) { this.value = value; }
}

if (!customElements.get('cap-radio-button')) customElements.define('cap-radio-button', RadioButton);
if (!customElements.get('cap-radio-group')) customElements.define('cap-radio-group', RadioGroup);
