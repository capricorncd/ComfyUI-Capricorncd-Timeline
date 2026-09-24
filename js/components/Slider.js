import "./Button.js";

/** Wrap a native range and optional value label, preserving native input events. */
export class Slider extends HTMLElement {
    static observedAttributes = ["reset-label"];

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = `
            <style>
                :host { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
                :host([hidden]) { display: none; }
                slot { display: contents; }
                ::slotted(input[type="range"]) { flex: 1; width: 0; min-width: 0; margin: 0; accent-color: var(--cat-accent, #64d8c5); }
                cap-button { flex: none; }
            </style>
            <slot></slot>
            <cap-button shape="square" size="small" variant="ghost">
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a9 9 0 1 1 2.4 8.4M3 3v7h7"/></svg>
            </cap-button>
        `;
        this._reset = root.querySelector("cap-button");
        this._observer = new MutationObserver(() => this._syncDisabled());
        root.querySelector("slot").addEventListener("slotchange", () => this._bindInput());
        this._reset.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            const input = this.querySelector('input[type="range"]');
            if (!input || input.disabled) return;
            const previous = input.value;
            input.value = this.getAttribute("default-value") ?? input.defaultValue;
            if (input.value === previous) return;
            input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        });
    }

    connectedCallback() {
        this.attributeChangedCallback();
        this._bindInput();
    }

    disconnectedCallback() { this._observer.disconnect(); }

    attributeChangedCallback() {
        const label = this.getAttribute("reset-label") || "Reset";
        this._reset.setAttribute("aria-label", label);
        this._reset.setAttribute("title", label);
    }

    _bindInput() {
        this._observer.disconnect();
        const input = this.querySelector('input[type="range"]');
        if (input) this._observer.observe(input, { attributes: true, attributeFilter: ["disabled"] });
        this._syncDisabled();
    }

    _syncDisabled() {
        const input = this.querySelector('input[type="range"]');
        this._reset.disabled = !input || input.disabled;
    }
}

if (!customElements.get("cap-slider")) customElements.define("cap-slider", Slider);
