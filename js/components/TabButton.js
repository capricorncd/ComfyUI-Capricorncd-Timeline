import { Button } from "./Button.js";

/** A tab retains native keyboard activation and shares the button presentation. */
export class TabButton extends Button {
    constructor() {
        super();
        this._button.setAttribute("role", "tab");
    }
}

if (!customElements.get("cap-tab-button")) {
    customElements.define("cap-tab-button", TabButton);
}
