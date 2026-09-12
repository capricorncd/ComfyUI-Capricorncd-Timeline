/** Shared native-button presentation and interaction. */
export class Button extends HTMLElement {
    static observedAttributes = ["disabled", "aria-haspopup", "aria-label", "aria-pressed"];

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = `
            <style>
                :host { display: inline-flex; vertical-align: middle; }
                :host([hidden]) { display: none; }
                button {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    box-sizing: border-box;
                    height: 28px;
                    padding: 0 10px;
                    border: 1px solid var(--cat-border-soft, #344950);
                    border-radius: 6px;
                    background: rgba(255,255,255,0.06);
                    color: var(--cat-text, #e2e8f0);
                    font-family: inherit;
                    font-size: 12px;
                    white-space: nowrap;
                    cursor: pointer;
                    transition: background 0.12s, border-color 0.12s;
                }
                button:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.15); }
                button:focus-visible { outline: 2px solid var(--cat-accent, #64d8c5); outline-offset: 2px; }
                :host([shape="square"]) button { width: 28px; padding: 0; }
                :host([shape="circle"]) button { width: 34px; height: 34px; padding: 0; border-radius: 50%; }
                :host([variant="accent"]) button {
                    background: rgba(100,216,197,0.15); border-color: rgba(100,216,197,0.35); color: var(--cat-accent, #64d8c5);
                }
                :host([variant="accent"]) button:hover { background: rgba(100,216,197,0.25); color: var(--cat-accent-soft, #a4e5dc); }
                :host([variant="amber"]) button { background: rgba(217,164,65,0.15); border-color: rgba(217,164,65,0.4); color: #e8c483; }
                :host([variant="amber"]) button:hover { background: rgba(217,164,65,0.25); color: #f5d9a8; }
                :host([variant="danger"]) button { color: #aaa; }
                :host([variant="danger"]) button:hover { color: #fff; background: rgba(255,80,80,0.2); border-color: rgba(255,80,80,0.45); }
                :host([aria-pressed="true"]) button, :host([aria-pressed="true"]) button:hover {
                    background: rgba(74,158,255,0.18); border-color: rgba(74,158,255,0.45); color: #9ec5ff;
                }
                :host([variant="primary"]) button { background: var(--cat-action, #167970); border-color: transparent; color: #fff; }
                :host([variant="primary"]) button:hover { background: var(--cat-action-hover, #1b9186); }
                :host([variant="primary"][aria-pressed="true"]) button { background: #ff4466; }
                :host([variant="primary"][aria-pressed="true"]) button:hover { background: #ff6680; }
                :host([disabled]) button:disabled, :host([disabled]) button:disabled:hover {
                    opacity: 0.35; cursor: default; background: rgba(255,255,255,0.06);
                    color: var(--cat-muted, #94a3b8); border-color: var(--cat-border-soft, #344950);
                }
            </style>
            <button type="button"><slot></slot></button>
        `;
        this._button = root.querySelector("button");
    }

    get disabled() { return this.hasAttribute("disabled"); }
    set disabled(value) { this.toggleAttribute("disabled", !!value); }

    attributeChangedCallback(name) {
        if (name === "disabled") this._button.disabled = this.disabled;
        else if (this.hasAttribute(name)) this._button.setAttribute(name, this.getAttribute(name));
        else this._button.removeAttribute(name);
    }

    click() { this._button.click(); }
    focus(options) { this._button.focus(options); }
}

if (!customElements.get("cap-button")) {
    customElements.define("cap-button", Button);
}
