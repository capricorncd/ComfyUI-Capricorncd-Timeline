export class ImageCompare extends HTMLElement {
    constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>
            :host { display:block; position:relative; min-height:180px; height:100%; background:var(--cat-bg,#10191d); }
            img { position:absolute; width:100%; height:100%; object-fit:contain; pointer-events:none; }
            .before { clip-path:inset(0 100% 0 0); }
            input { position:absolute; inset:0; width:100%; height:100%; margin:0; opacity:0; cursor:ew-resize; touch-action:none; }
            .line { position:absolute; top:0; bottom:0; left:0; border-left:2px solid var(--cat-accent,#68afff); pointer-events:none; }
            .line::after { content:'↔'; position:absolute; top:50%; left:0; padding:4px; background:var(--cat-raised,#202c31); color:var(--cat-text,#fff); }
            :host(:focus-within) { outline:2px solid var(--cat-accent,#68afff); }
        </style><img class="after"><img class="before"><div class="line"></div><input type="range" min="0" max="100" value="0" step="0.1">`;
        this._slider = root.querySelector('input');
        this._slider.addEventListener('input', () => this._renderPosition());
        this._slider.addEventListener('pointerdown', event => {
            event.preventDefault();
            this._slider.focus();
            this._slider.setPointerCapture(event.pointerId);
            this._move(event);
        });
        this._slider.addEventListener('pointermove', event => {
            if (this._slider.hasPointerCapture(event.pointerId)) this._move(event);
        });
    }

    setImages(before, after, beforeLabel, afterLabel) {
        const oldImage = this.shadowRoot.querySelector('.before');
        const newImage = this.shadowRoot.querySelector('.after');
        oldImage.src = before;
        oldImage.alt = beforeLabel;
        newImage.src = after;
        newImage.alt = afterLabel;
        this._slider.setAttribute('aria-label', `${beforeLabel} / ${afterLabel}`);
        this._slider.value = '0';
        this._renderPosition();
    }

    _move(event) {
        const rect = this.getBoundingClientRect();
        if (rect.width) this._slider.value = String(Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)));
        this._renderPosition();
    }

    _renderPosition() {
        const percent = Number(this._slider.value);
        this.shadowRoot.querySelector('.before').style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
        this.shadowRoot.querySelector('.line').style.left = `${percent}%`;
    }
}

if (!customElements.get('cap-image-compare')) customElements.define('cap-image-compare', ImageCompare);
