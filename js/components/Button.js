/** Shared native-button presentation and interaction. */
export class Button extends HTMLElement {
    static observedAttributes = ["disabled", "role", "aria-haspopup", "aria-label", "aria-pressed", "aria-selected", "aria-checked", "aria-controls", "tabindex", "title"];

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open", delegatesFocus: true });
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
                    width: 100%;
                    min-width: 0;
                    height: 28px;
                    padding: 0 10px;
                    border: 1px solid var(--cat-border-soft, #344950);
                    border-radius: 6px;
                    background: var(--cat-raised, rgba(255,255,255,0.06));
                    color: var(--cat-text, #e2e8f0);
                    font-family: inherit;
                    font-size: calc(var(--cat-font-size, 1rem) * 0.857143);
                    white-space: nowrap;
                    cursor: pointer;
                    transition: background 0.12s, border-color 0.12s;
                }
                button:hover { background: color-mix(in srgb, var(--cat-text) 8%, var(--cat-surface)); border-color: var(--cat-border); }
                button:focus { outline: none; }
                button:focus-visible { outline: 2px solid var(--cat-accent); outline-offset: 2px; }
                :host([shape="square"]) button { width: 28px; padding: 0; }
                :host([shape="circle"]) button { width: 34px; height: 34px; padding: 0; border-radius: 50%; }
                :host([size="small"]) button { height: 22px; padding: 0 6px; font-size: calc(var(--cat-font-size, 1rem) * 0.785714); }
                :host([size="small"][shape="square"]) button { width: 22px; padding: 0; }
                :host([size="regular"]) button { height: 36px; padding: 0 14px; font-size: calc(var(--cat-font-size, 1rem) * 0.928571); }
                :host([size="regular"][shape="square"]) button { width: 36px; padding: 0; }
                :host([size="large"]) button { height: 44px; font-size: calc(var(--cat-font-size, 1rem) * 1.142857); }
                :host([size="large"][shape]) button { width: 44px; padding: 0; }
                :host([size="content"]) button { height: auto; padding: 10px; white-space: normal; }
                :host([align="start"]) button { justify-content: flex-start; text-align: left; }
                :host([role="menuitem"]) slot { display: block; width: 100%; }
                :host([truncate]) { min-width: 0; }
                :host([truncate]) slot { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                :host([variant="ghost"]) button { background: transparent; border-color: transparent; }
                :host([variant="ghost"]) button:hover { background: color-mix(in srgb, var(--cat-text) 8%, transparent); }
                :host([variant="success"]) button { color: #86efac; border-color: #3f7a55; background: rgba(34,84,54,0.55); }
                :host([variant="accent"]) button {
                    background: var(--cat-selected); border-color: color-mix(in srgb, var(--cat-accent) 35%, transparent); color: var(--cat-accent, #64d8c5);
                }
                :host([variant="accent"]) button:hover { background: color-mix(in srgb, var(--cat-accent) 20%, var(--cat-surface)); color: var(--cat-accent-soft, #a4e5dc); }
                :host([variant="amber"]) button { background: rgba(217,164,65,0.15); border-color: rgba(217,164,65,0.4); color: var(--cat-amber, #e8c483); }
                :host([variant="amber"]) button:hover { background: rgba(217,164,65,0.25); color: var(--cat-amber, #f5d9a8); }
                :host([variant="danger"]) button { color: var(--cat-danger, #ff8080); }
                :host([variant="danger"]) button:hover { color: var(--cat-danger, #ffaaaa); background: rgba(255,80,80,0.2); border-color: rgba(255,80,80,0.45); }
                :host([aria-pressed="true"]) button, :host([aria-pressed="true"]) button:hover,
                :host([role="radio"][aria-checked="true"]) button,
                :host([aria-selected="true"]) button, :host([aria-selected="true"]) button:hover {
                    background: var(--cat-selected); border-color: var(--cat-accent); color: var(--cat-text);
                }
                :host([role="radio"][indicator]) button::before {
                    content: ""; flex: 0 0 14px; width: 14px; height: 14px; box-sizing: border-box;
                    border: 1px solid var(--cat-border); border-radius: 50%; background: var(--cat-surface);
                }
                :host([role="radio"][indicator][aria-checked="true"]) button::before {
                    border: 4px solid var(--cat-accent);
                }
                :host([variant="tab"]) button { height: 38px; border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: transparent; color: var(--cat-muted); }
                :host([variant="tab"]) button:hover { color: var(--cat-text); background: var(--cat-raised); }
                :host([variant="tab"][aria-selected="true"]) button { color: var(--cat-text); border-bottom-color: var(--cat-accent); background: transparent; }
                :host([variant="card"]) button { background: var(--cat-surface); border-radius: 12px; padding: 16px; box-shadow: 0 2px 6px #00000008; }
                :host([variant="card"]) button:hover { border-color: var(--cat-accent); background: color-mix(in srgb, var(--cat-accent) 3%, var(--cat-surface)); }
                :host([variant="card"][aria-pressed="true"]) button { background: var(--cat-selected); border-color: var(--cat-accent); box-shadow: inset 3px 0 var(--cat-accent); }
                :host([variant="primary"]) button { background: var(--cat-action, #167970); border-color: transparent; color: #fff; }
                :host([variant="primary"]) button:hover { background: var(--cat-action-hover, #1b9186); }
                :host([variant="primary"][aria-pressed="true"]) button { background: #ff4466; }
                :host([variant="primary"][aria-pressed="true"]) button:hover { background: #ff6680; }
                :host([disabled]) button:disabled, :host([disabled]) button:disabled:hover {
                    opacity: 0.35; cursor: default; background: var(--cat-raised, rgba(255,255,255,0.06));
                    color: var(--cat-muted, #94a3b8); border-color: var(--cat-border-soft, #344950);
                }
            </style>
            <button type="button"><slot></slot></button>
        `;
        this._button = root.querySelector("button");
    }

    get disabled() { return this.hasAttribute("disabled"); }
    set disabled(value) { this.toggleAttribute("disabled", !!value); }
    get tabIndex() { return this._button.tabIndex; }
    set tabIndex(value) { this._button.tabIndex = value; }

    attributeChangedCallback(name) {
        if (name === "disabled") this._button.disabled = this.disabled;
        else if (this.hasAttribute(name)) this._button.setAttribute(name, this.getAttribute(name));
        else this._button.removeAttribute(name);
    }

    click() { this._button.click(); }
    focus(options) { this._button.focus(options); }

    get focusable() { return !this.disabled && this._button.tabIndex >= 0; }
}

if (!customElements.get("cap-button")) {
    customElements.define("cap-button", Button);
}
