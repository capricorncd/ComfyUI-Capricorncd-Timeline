import './Button.js';
import { iconHtml } from '../cap_icons.js';
import { makeT } from '../cap_i18n.js';
const T = makeT({
    zh: { title: '选择关联素材', search: '搜索素材名称…', all: '全部', character: '角色', scene: '场景', prop: '道具', other: '其他', empty: '没有匹配的素材', close: '关闭素材列表' },
    en: { title: 'Select linked asset', search: 'Search asset names…', all: 'All', character: 'Characters', scene: 'Scenes', prop: 'Props', other: 'Other', empty: 'No matching assets', close: 'Close asset list' },
    ja: { title: '関連素材を選択', search: '素材名を検索…', all: 'すべて', character: 'キャラクター', scene: 'シーン', prop: '小道具', other: 'その他', empty: '一致する素材がありません', close: '素材一覧を閉じる' },
});

export function mentionQuery(value, cursor) {
    const match = value.slice(0, cursor).match(/@([^@\s\[\]()]{0,80})$/);
    return match ? { start: cursor - match[0].length, end: cursor, query: match[1] } : null;
}

/** Asset suggestions for an existing prompt textarea; owns popup and keyboard behavior. */
export class PromptMentions extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' }).innerHTML = `<style>
            :host { position:fixed; z-index:100100; width:min(340px,calc(100vw - 24px)); color:var(--cat-text); font:inherit; }
            :host([hidden]) {display:none}
            .panel {display:flex; flex-direction:column; max-height:inherit; background:var(--cat-surface,#192226); border:1px solid var(--cat-border-soft,#344950); border-radius:8px; box-shadow:0 8px 24px #0005; overflow:hidden}
            header {display:flex; align-items:center; justify-content:space-between; padding:12px 14px 8px}
            input {margin:0 14px 8px; min-width:0; padding:8px; color:inherit; background:var(--cat-input,#10191d); border:1px solid var(--cat-border-soft,#344950); border-radius:4px; font:inherit}
            nav {display:flex; flex-wrap:wrap; gap:4px; padding:0 14px 10px}
            .list {overflow:auto; padding:4px 8px 8px; min-height:0}
            .list cap-button {display:flex; width:100%; margin:4px 0;}
            .row {display:flex; gap:10px; align-items:center; width:100%; min-width:0; padding:6px 0}
            img,video {width:52px;height:44px;object-fit:contain;flex-shrink:0;background:var(--cat-bg)}
            .name {text-align:left;overflow-wrap:anywhere;min-width:0}
            small {display:block;color:var(--cat-muted);font-size:.8em}
            p {margin:12px;color:var(--cat-muted)}
        </style><div class="panel"><header><strong></strong><cap-button size="small" variant="ghost" shape="square">${iconHtml("close", 14)}</cap-button></header>
            <input type="search"><nav></nav><div class="list" role="listbox"></div></div>`;
        this.category = 'all';
        this.root = this.shadowRoot;
        this.root.querySelector('strong').textContent = T('title');
        this.root.querySelector('.list').setAttribute('aria-label', T('title'));
        const close = this.root.querySelector('cap-button');
        close.setAttribute('aria-label', T('close'));
        close.onclick = () => { this.close(); this.textarea?.focus(); };
        this.search = this.root.querySelector('input');
        this.search.placeholder = T('search');
        this.search.setAttribute('aria-label', T('search'));
        this.search.oninput = () => this.render();
        for (const key of ['all', 'character', 'scene', 'prop', 'other']) {
            const button = document.createElement('cap-button');
            button.textContent = T(key);
            button.setAttribute('size', 'small');
            button.dataset.category = key;
            button.onclick = () => { this.category = key; this.render(); };
            this.root.querySelector('nav').append(button);
        }
        this.onKey = event => {
            if (this.hidden || event.isComposing) return;
            if (event.currentTarget === this.root && event.composedPath()[0] !== this.search && event.key !== 'Escape') return;
            if (!['Escape', 'ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
            event.preventDefault(); event.stopImmediatePropagation();
            if (event.key === 'Escape') { this.close(); this.textarea.focus(); return; }
            if (event.key === 'Enter') { if (this.results[this.index]) this.select(this.results[this.index]); return; }
            this.index = (this.index + (event.key === 'ArrowDown' ? 1 : -1) + this.results.length) % (this.results.length || 1);
            this.highlight();
        };
        this.root.addEventListener('keydown', this.onKey);
    }

    bind(textarea, getAssets) {
        this.controller?.abort();
        this.textarea = textarea;
        this.getAssets = getAssets;
        this.controller = new AbortController();
        const signal = this.controller.signal;
        const update = event => {
            if (event.isComposing || textarea.readOnly || textarea.disabled) { this.close(); return; }
            this.match = mentionQuery(textarea.value, textarea.selectionStart);
            if (!this.match || textarea.selectionStart !== textarea.selectionEnd) { this.close(); return; }
            this.assets = getAssets();
            this.search.value = this.match.query;
            this.hidden = false;
            this.render();
            this.place();
        };
        textarea.addEventListener('input', update, {signal});
        textarea.addEventListener('click', () => this.close(), {signal});
        textarea.addEventListener('keydown', this.onKey, {signal, capture:true});
        document.addEventListener('pointerdown', event => {
            if (!event.composedPath().includes(this) && event.target !== textarea) this.close();
        }, {signal});
        window.addEventListener('resize', () => this.close(), {signal});
        textarea.addEventListener('blur', event => {
            if (!this.contains(event.relatedTarget)) this.close();
        }, {signal});
    }

    connectedCallback() { this.hidden = true; }
    disconnectedCallback() { this.controller?.abort(); }
    close() { this.hidden = true; }
    place() {
        const rect = this.textarea.getBoundingClientRect();
        const height = Math.min(360, window.innerHeight - 24);
        this.style.maxHeight = `${height}px`;
        this.style.left = `${Math.max(12, Math.min(rect.left + 12, window.innerWidth - this.offsetWidth - 12))}px`;
        this.style.top = `${Math.max(12, Math.min(rect.top + 40, window.innerHeight - height - 12))}px`;
    }
    render() {
        const query = this.search.value.trim().toLocaleLowerCase();
        this.results = this.assets.filter(asset => (this.category === 'all' || (asset.category || 'other') === this.category)
            && asset.name.toLocaleLowerCase().includes(query));
        this.index = 0;
        for (const button of this.root.querySelectorAll('nav cap-button')) button.setAttribute('aria-pressed', String(button.dataset.category === this.category));
        const list = this.root.querySelector('.list');
        list.replaceChildren();
        for (const asset of this.results) {
            const button = document.createElement('cap-button');
            button.setAttribute('size', 'content');
            button.setAttribute('variant', 'ghost');
            button.setAttribute('role', 'option');
            const row = document.createElement('span'); row.className = 'row';
            if (asset.preview && ['image','video'].includes(asset.kind)) {
                const media = document.createElement(asset.kind === 'video' ? 'video' : 'img');
                media.src = asset.preview;
                if (asset.kind === 'image') { media.alt = ''; media.loading = 'lazy'; }
                else { media.muted = true; media.preload = 'metadata'; }
                row.append(media);
            }
            const name = document.createElement('span'); name.className = 'name'; name.textContent = asset.name;
            const detail = document.createElement('small'); detail.textContent = asset.file;
            name.append(detail); row.append(name); button.append(row);
            button.addEventListener('pointerdown', event => event.preventDefault());
            button.onclick = () => this.select(asset);
            list.append(button);
        }
        if (!this.results.length) { const empty = document.createElement('p'); empty.textContent = T('empty'); list.append(empty); }
        this.highlight();
    }
    highlight() {
        [...this.root.querySelectorAll('.list cap-button')].forEach((button, index) => {
            button.setAttribute('aria-selected', String(index === this.index));
            button.setAttribute('aria-pressed', String(index === this.index));
            if (index === this.index) button.scrollIntoView({block:'nearest'});
        });
    }
    select(asset) {
        const ta = this.textarea;
        if (ta.readOnly || ta.disabled || !this.match) return;
        ta.focus();
        ta.setRangeText(`@${asset.name} `, this.match.start, this.match.end, 'end');
        ta.dispatchEvent(new Event('input', {bubbles:true}));
        this.dispatchEvent(new CustomEvent('asset-mention', {detail:asset}));
        this.close();
    }
}
customElements.define('cap-prompt-mentions', PromptMentions);
