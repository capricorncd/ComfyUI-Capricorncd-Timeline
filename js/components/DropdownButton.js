import "./Button.js";

/** Shared hover trigger; callers create and position their menu. */
export class DropdownButton extends HTMLElement {
    static observedAttributes = ["disabled", "variant", "aria-label"];

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = `
            <style>
                :host { display: inline-flex; vertical-align: middle; }
                :host([hidden]) { display: none; }
                .caret {
                    width: 0; height: 0; flex-shrink: 0;
                    border-left: 3px solid transparent; border-right: 3px solid transparent;
                    border-top: 4px solid currentColor;
                }
            </style>
            <cap-button aria-haspopup="menu"><slot></slot><span class="caret" aria-hidden="true"></span></cap-button>
        `;
        this._button = root.querySelector("cap-button");
        this._menu = null;
        this._hideTimer = null;
        this._openMenu = null;
        this.addEventListener("pointerenter", event => {
            if (event.pointerType !== "touch") this._showMenu(event);
        });
        this.addEventListener("pointerleave", () => this._scheduleMenuHide());
        this.addEventListener("click", event => {
            if (!this._openMenu) return;
            event.stopPropagation();
            this._showMenu(event);
        });
    }

    get disabled() { return this.hasAttribute("disabled"); }
    set disabled(value) { this.toggleAttribute("disabled", !!value); }

    attributeChangedCallback(name) {
        if (name === "disabled") {
            this._button.disabled = this.disabled;
            if (this.disabled) this._hideMenu();
        }
        else if (this.hasAttribute(name)) this._button.setAttribute(name, this.getAttribute(name));
        else this._button.removeAttribute(name);
    }

    click() { this._button.click(); }
    focus(options) { this._button.focus(options); }

    bindMenu(openMenu) {
        this._hideMenu();
        this._openMenu = openMenu;
    }

    _showMenu(event) {
        clearTimeout(this._hideTimer);
        if (this.disabled || !this._openMenu || this._menu?.isConnected) return;
        this._menu = this._openMenu(event);
        if (!this._menu) return;
        this._menu.addEventListener("pointerenter", () => clearTimeout(this._hideTimer));
        this._menu.addEventListener("pointerleave", () => this._scheduleMenuHide());
    }

    _scheduleMenuHide() {
        clearTimeout(this._hideTimer);
        this._hideTimer = setTimeout(() => this._hideMenu(), 180);
    }

    _hideMenu() {
        clearTimeout(this._hideTimer);
        this._menu?.remove();
        this._menu = null;
    }

    disconnectedCallback() { this._hideMenu(); }
}

if (!customElements.get("cap-dropdown-button")) {
    customElements.define("cap-dropdown-button", DropdownButton);
}
