import "./Button.js";
import { iconHtml } from "../cap_icons.js";

export function resetDialogPosition(target) {
    for (const property of ["position", "left", "top", "margin", "right", "bottom"]) target.style[property] = "";
}

/** Also used by existing editor panels until their content moves to cap-dialog. */
export function bindDialogDrag(dialog, handle, target = dialog) {
    let drag = null;
    const place = (left, top) => {
        const rect = target.getBoundingClientRect();
        Object.assign(target.style, {
            position: "fixed", margin: "0", right: "auto", bottom: "auto",
            left: `${Math.max(8, Math.min(window.innerWidth - rect.width - 8, left))}px`,
            top: `${Math.max(8, Math.min(window.innerHeight - rect.height - 8, top))}px`,
        });
    };
    const end = () => {
        const id = drag?.id;
        drag = null;
        dialog.classList.remove("is-dragging");
        if (id !== undefined && handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
    };
    const down = event => {
        if (event.button !== 0 || event.target.closest("button, cap-button, cap-tab-button, cap-dropdown-button, input, select, textarea, a, [contenteditable='true']")) return;
        event.preventDefault();
        const rect = target.getBoundingClientRect();
        drag = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
        handle.setPointerCapture(event.pointerId);
        dialog.classList.add("is-dragging");
    };
    const move = event => {
        if (drag?.id === event.pointerId) place(event.clientX - drag.x, event.clientY - drag.y);
    };
    const resize = () => {
        if (!target.style.left) return;
        const rect = target.getBoundingClientRect();
        place(rect.left, rect.top);
    };
    handle.addEventListener("pointerdown", down);
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    handle.addEventListener("lostpointercapture", end);
    window.addEventListener("resize", resize);
    return () => {
        end();
        handle.removeEventListener("pointerdown", down);
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        handle.removeEventListener("lostpointercapture", end);
        window.removeEventListener("resize", resize);
    };
}

export function bindDialogResize(dialog, handle) {
    let resize = null;
    const end = () => {
        const id = resize?.id;
        resize = null;
        dialog.classList.remove("is-resizing");
        if (id !== undefined && handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
    };
    const down = event => {
        if (event.button !== 0) return;
        event.preventDefault();
        const rect = dialog.getBoundingClientRect();
        const style = getComputedStyle(dialog);
        resize = {
            id: event.pointerId, x: event.clientX, y: event.clientY, rect,
            minWidth: parseFloat(style.getPropertyValue("--cap-dialog-min-width")) || 320,
            minHeight: parseFloat(style.getPropertyValue("--cap-dialog-min-height")) || 160,
        };
        Object.assign(dialog.style, {
            position: "fixed", margin: "0", right: "auto", bottom: "auto",
            left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
        });
        handle.setPointerCapture(event.pointerId);
        dialog.classList.add("is-resizing");
    };
    const move = event => {
        if (resize?.id !== event.pointerId) return;
        const { rect, x, y, minWidth, minHeight } = resize;
        const maxWidth = Math.max(0, Math.min(window.innerWidth * 0.8, window.innerWidth - rect.left - 8));
        const maxHeight = Math.max(0, Math.min(window.innerHeight * 0.8, window.innerHeight - rect.top - 8));
        dialog.style.width = `${Math.max(Math.min(minWidth, maxWidth), Math.min(maxWidth, rect.width + event.clientX - x))}px`;
        dialog.style.height = `${Math.max(Math.min(minHeight, maxHeight), Math.min(maxHeight, rect.height + event.clientY - y))}px`;
    };
    handle.addEventListener("pointerdown", down);
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    handle.addEventListener("lostpointercapture", end);
    window.addEventListener("resize", end);
    return () => {
        end();
        handle.removeEventListener("pointerdown", down);
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        handle.removeEventListener("lostpointercapture", end);
        window.removeEventListener("resize", end);
    };
}

class DialogResizeHandle extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = `<style>
            :host { position: absolute; right: 0; bottom: 0; width: 16px; height: 16px; z-index: 2; cursor: nwse-resize; touch-action: none; }
            :host::after { content: ""; position: absolute; right: 4px; bottom: 4px; width: 6px; height: 6px; border-right: 2px solid var(--cat-muted, #a3b5b8); border-bottom: 2px solid var(--cat-muted, #a3b5b8); }
        </style>`;
    }
}

if (!customElements.get("cap-dialog-resize-handle")) customElements.define("cap-dialog-resize-handle", DialogResizeHandle);

export class Dialog extends HTMLElement {
    static observedAttributes = ["aria-label", "close-label", "close-disabled"];

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = `
            <style>
                :host { display: contents; }
                dialog {
                    position: fixed; inset: 0; margin: auto; padding: 0;
                    width: var(--cap-dialog-width, 460px); max-width: 80vw; max-height: 80vh;
                    min-width: min(var(--cap-dialog-min-width, 320px), 80vw);
                    min-height: min(var(--cap-dialog-min-height, 160px), 80vh);
                    box-sizing: border-box; overflow: hidden;
                    background: var(--cat-raised, #202c31); color: var(--cat-text, #e4edeb);
                    border: 1px solid var(--cat-border, #34464b); border-radius: 8px;
                    box-shadow: var(--cap-dialog-shadow, 0 16px 40px -8px rgba(0,0,0,0.65));
                    font-family: inherit; font-size: 13px; line-height: 1.6; color-scheme: dark;
                    z-index: var(--cap-dialog-z-index, 100009);
                }
                dialog[open] { display: flex; flex-direction: column; }
                dialog::backdrop { background: var(--cap-dialog-backdrop, rgba(0,0,0,0.55)); }
                header {
                    display: flex; align-items: center; justify-content: space-between; gap: 12px;
                    flex-shrink: 0; padding: 12px 14px; font-weight: 700;
                    border-bottom: 1px solid var(--cat-border, #34464b);
                    cursor: move; touch-action: none; user-select: none;
                }
                slot[name="title"] { min-width: 0; overflow-wrap: anywhere; }
                header > cap-button { flex-shrink: 0; }
                .body { flex: 1; min-height: 0; overflow: auto; }
                .is-dragging, .is-resizing { user-select: none; }
            </style>
            <dialog aria-labelledby="title">
                <header><slot id="title" name="title"></slot><cap-button shape="square" variant="danger" aria-label="Close" title="Close">${iconHtml("close", 18)}</cap-button></header>
                <div class="body"><slot></slot></div>
                <cap-dialog-resize-handle class="resize-handle" aria-hidden="true"></cap-dialog-resize-handle>
            </dialog>`;
        this._dialog = root.querySelector("dialog");
        this._closeButton = root.querySelector("cap-button");
        this._closeButton.addEventListener("click", () => this.requestClose());
        this._dialog.addEventListener("cancel", event => {
            event.preventDefault();
            this.requestClose();
        });
        this._dialog.addEventListener("close", () => {
            if (!this.open) this.dispatchEvent(new Event("close"));
        });
        this.addEventListener("keydown", event => {
            event.stopPropagation();
            if (event.key === "Escape" && !this.hasAttribute("modal")) {
                event.preventDefault();
                this.requestClose();
            }
        });
    }

    connectedCallback() {
        this._unbindDrag = bindDialogDrag(this._dialog, this.shadowRoot.querySelector("header"));
        this._unbindResize = bindDialogResize(this._dialog, this.shadowRoot.querySelector(".resize-handle"));
    }

    disconnectedCallback() {
        this._unbindDrag?.();
        this._unbindDrag = null;
        this._unbindResize?.();
        this._unbindResize = null;
        this.close();
    }

    attributeChangedCallback(name) {
        if (name === "close-disabled") this._closeButton.disabled = this.hasAttribute(name);
        else if (name === "close-label") {
            const label = this.getAttribute(name) || "Close";
            this._closeButton.setAttribute("aria-label", label);
            this._closeButton.title = label;
        } else if (this.hasAttribute(name)) this._dialog.setAttribute(name, this.getAttribute(name));
        else this._dialog.removeAttribute(name);
    }

    get open() { return this._dialog.open; }
    get closeDisabled() { return this.hasAttribute("close-disabled"); }
    set closeDisabled(value) { this.toggleAttribute("close-disabled", !!value); }

    showModal() { this._show(true); }
    show() { this._show(false); }

    _show(modal) {
        if (this.open) return;
        resetDialogPosition(this._dialog);
        if (modal) this._dialog.showModal();
        else this._dialog.show();
        this.toggleAttribute("modal", modal);
        this.setAttribute("open", "");
    }

    requestClose() {
        if (!this.open || this.closeDisabled) return;
        if (this.dispatchEvent(new Event("cancel", { cancelable: true }))) this.close();
    }

    close() {
        if (!this.open) return;
        this._dialog.close();
        this.removeAttribute("open");
        this.removeAttribute("modal");
    }
}

if (!customElements.get("cap-dialog")) customElements.define("cap-dialog", Dialog);
