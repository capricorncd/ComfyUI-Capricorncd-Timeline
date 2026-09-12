/** Shared status panel. Content is plain text; presentation stays inside Shadow DOM. */
export class StatusMessage extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = `
            <style>
                :host { display: block; min-width: 0; }
                :host([hidden]), :host(:empty) { display: none; }
                .panel {
                    box-sizing: border-box;
                    font-family: inherit;
                    font-size: 12px;
                    line-height: 1.4;
                    color: var(--cat-text, #e2e8f0);
                    padding: 8px 10px;
                    border-radius: 4px;
                    background: var(--cat-raised, #24343a);
                    border: 1px solid var(--cat-border, #344950);
                    white-space: pre-wrap;
                    overflow-wrap: anywhere;
                }
                :host([state="success"]) .panel {
                    color: #bbf7d0;
                    border-color: #166534;
                    background: #0f1a14;
                }
                :host([state="error"]) .panel {
                    color: #fecaca;
                    border-color: #7f1d1d;
                    background: #1f1216;
                }
            </style>
            <div class="panel" role="status" aria-live="polite" aria-atomic="true"><slot></slot></div>
        `;
    }

    setStatus(text, state = "info") {
        this.textContent = String(text ?? "");
        this.setAttribute("state", state === "success" || state === "error" ? state : "info");
        this.hidden = !this.textContent;
    }
}

if (!customElements.get("cap-status-message")) {
    customElements.define("cap-status-message", StatusMessage);
}
