import "./Button.js";
import { iconHtml } from "../cap_icons.js";
import { formatTimecode } from "../timecode.js";

export class ExportRange extends HTMLElement {
    constructor() {
        super();
        this.fps = 24;
        this.totalFrames = 0;
        this.startFrame = 0;
        this.endFrame = 0;
        this.currentFrame = 0;
        this.playing = false;
        this.attachShadow({ mode: "open" }).innerHTML = `
            <style>
                :host { display: block; min-width: 0; color: var(--cat-text, #e4edeb); font-size: 12px; }
                .transport { display: flex; align-items: center; gap: 10px; }
                .time { font-variant-numeric: tabular-nums; }
                .track { position: relative; height: 40px; margin: 4px 10px; touch-action: none; }
                .rail, .selection { position: absolute; top: 20px; height: 5px; border-radius: 3px; }
                .rail { width: 100%; background: var(--cat-border, #34464b); }
                .selection { background: var(--cat-action, #64d8c5); pointer-events: none; }
                [role=slider] { position: absolute; cursor: ew-resize; touch-action: none; outline: none; }
                .endpoint { width: 20px; height: 22px; top: 0; transform: translateX(-50%); }
                .endpoint::after { content: ""; position: absolute; left: 3px; top: 8px;
                    border-left: 7px solid transparent; border-right: 7px solid transparent;
                    border-top: 12px solid var(--cat-muted, #9aaeb5); }
                .endpoint:focus::after { border-top-color: #ffb300; }
                .playhead { width: 14px; height: 20px; top: 18px; transform: translateX(-50%); }
                .playhead::after { content: ""; display: block; width: 2px; height: 18px; margin: 0 auto; background: var(--cat-text, white); }
                .playhead:focus { outline: 1px solid var(--cat-action, #64d8c5); border-radius: 2px; }
                .range, .hint { color: var(--cat-muted, #9aaeb5); margin-top: 3px; }
                .range { font-variant-numeric: tabular-nums; }
            </style>
            <div class="transport"><cap-button class="play"></cap-button><span class="time"></span></div>
            <div class="track">
                <div class="rail"></div><div class="selection"></div>
                <div class="endpoint start" role="slider" tabindex="0" data-part="start" aria-orientation="horizontal"></div>
                <div class="endpoint end" role="slider" tabindex="0" data-part="end" aria-orientation="horizontal"></div>
                <div class="playhead" role="slider" tabindex="0" data-part="current" aria-orientation="horizontal"></div>
            </div>
            <div class="range"></div><div class="hint"></div>`;
        this._track = this.shadowRoot.querySelector(".track");
        this._play = this.shadowRoot.querySelector(".play");
        this._play.addEventListener("click", () => this.dispatchEvent(new Event("toggleplay")));
        this._track.addEventListener("pointerdown", event => {
            if (event.button !== 0 || !this.totalFrames) return;
            event.preventDefault();
            this._drag = event.target.dataset.part || "current";
            this.shadowRoot.querySelector(`[data-part="${this._drag}"]`).focus();
            this._track.setPointerCapture(event.pointerId);
            this._movePointer(event);
        });
        this._track.addEventListener("pointermove", event => {
            if (this._drag) this._movePointer(event);
        });
        const endDrag = () => { this._drag = null; };
        this._track.addEventListener("pointerup", endDrag);
        this._track.addEventListener("pointercancel", endDrag);
        this._track.addEventListener("lostpointercapture", endDrag);
        this._track.addEventListener("keydown", event => {
            const part = event.target.dataset.part;
            if (!part || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
            const value = part === "start" ? this.startFrame : part === "end" ? this.endFrame : this.currentFrame;
            this._move(part, event.key === "Home" ? 0 : event.key === "End" ? this.totalFrames
                : value + (event.key === "ArrowLeft" ? -1 : 1));
        });
    }

    configure(totalFrames, fps, labels) {
        this.totalFrames = Math.max(0, Math.round(totalFrames));
        this.fps = fps;
        this.startFrame = 0;
        this.endFrame = this.totalFrames;
        this.currentFrame = 0;
        this.labels = labels;
        for (const part of ["start", "end", "current"]) {
            this.shadowRoot.querySelector(`[data-part="${part}"]`).setAttribute("aria-label", labels[part]);
        }
        this.shadowRoot.querySelector(".hint").textContent = labels.hint;
        this.update(0, false);
    }

    get exportRange() {
        return this.startFrame === 0 && this.endFrame === this.totalFrames ? null
            : { start_frame: this.startFrame, end_frame: this.endFrame };
    }

    _movePointer(event) {
        const rect = this._track.getBoundingClientRect();
        this._move(this._drag, Math.round((event.clientX - rect.left) / rect.width * this.totalFrames));
    }

    _move(part, frame) {
        if (!this.totalFrames) return;
        frame = Math.round(frame);
        if (part === "start") this.startFrame = Math.max(0, Math.min(this.endFrame - 1, frame));
        else if (part === "end") this.endFrame = Math.max(this.startFrame + 1, Math.min(this.totalFrames, frame));
        this.currentFrame = part === "start" ? this.startFrame : part === "end" ? this.endFrame - 1
            : Math.max(this.startFrame, Math.min(this.endFrame - 1, frame));
        this.update(this.currentFrame, false);
        this.dispatchEvent(new CustomEvent(part === "current" ? "seek" : "rangechange", {
            detail: { frame: this.currentFrame },
        }));
    }

    update(frame, playing) {
        this.currentFrame = Math.max(this.startFrame, Math.min(Math.max(this.startFrame, this.endFrame - 1), Math.floor(frame)));
        this.playing = playing;
        const percent = value => `${100 * value / Math.max(1, this.totalFrames)}%`;
        const nominalFps = Math.ceil(this.fps);
        const time = value => formatTimecode(value * 1000 / nominalFps, nominalFps);
        for (const [part, value, min, max] of [
            ["start", this.startFrame, 0, Math.max(0, this.endFrame - 1)],
            ["end", this.endFrame, Math.min(this.totalFrames, this.startFrame + 1), this.totalFrames],
            ["current", this.currentFrame, this.startFrame, Math.max(this.startFrame, this.endFrame - 1)],
        ]) {
            const control = this.shadowRoot.querySelector(`[data-part="${part}"]`);
            control.style.left = percent(value);
            control.setAttribute("aria-valuemin", min);
            control.setAttribute("aria-valuemax", max);
            control.setAttribute("aria-valuenow", value);
            control.setAttribute("aria-valuetext", time(value));
            control.setAttribute("aria-disabled", !this.totalFrames);
        }
        const selection = this.shadowRoot.querySelector(".selection");
        selection.style.left = percent(this.startFrame);
        selection.style.width = percent(this.endFrame - this.startFrame);
        const label = playing ? this.labels.pause : this.labels.play;
        if (this._play.getAttribute("aria-label") !== label) {
            this._play.innerHTML = iconHtml(playing ? "pause" : "play", 14);
            this._play.append(document.createTextNode(label));
        }
        this._play.setAttribute("aria-label", label);
        this._play.disabled = !this.totalFrames;
        this.shadowRoot.querySelector(".time").textContent = time(this.currentFrame);
        this.shadowRoot.querySelector(".range").textContent = `${this.labels.start} ${time(this.startFrame)} — ${this.labels.end} ${time(this.endFrame)} · ${time(this.endFrame - this.startFrame)}`;
    }
}

if (!customElements.get("cap-export-range")) customElements.define("cap-export-range", ExportRange);
