import { h3Query } from './H3PromptCompletion.js';
import { replaceRichPromptRange } from './RichPrompt.js';
import { assetMentionRanges } from './InlinePromptEditor.js';
import './Button.js';
import { iconHtml } from '../cap_icons.js';
import { makeT } from '../cap_i18n.js';
const T = makeT({
    zh: { dialogue: '选择台词语言', h3: 'H3 标签与用法', h3Search: '搜索标签或说明…', h3Empty: '没有匹配的 H3 选项', h3Close: '关闭 H3 列表', retention: '选择参考保留标记', fully_preserved: '完整保留参考特征（如保持人物身份和服装）', partially_preserved: '部分保留并修改特征（如保留服装版型，去掉标志）', attribute_transfer: '将特征转移给另一主体（如把材质用于另一人物）', weak_reference: '仅借鉴风格、类别或氛围（如借鉴场景色调）', fully_copy: '完整复用音频（如原声贯穿整段视频）', partially_copy: '部分复用音频（如只保留某段对白）', reference: '参考音色、节奏等特征（如参考声音生成新对白）', audio_weak: '仅借鉴声音类别或氛围（如相似的环境声）', unavailable: '素材预览不可用', remove: '删除素材引用', title: '选择关联素材', search: '搜索素材名称…', all: '全部', character: '角色', scene: '场景', prop: '道具', grid_storyboard: '宫格图', other: '其他', empty: '没有匹配的素材', close: '关闭素材列表' },
    en: { dialogue: 'Select dialogue language', h3: 'H3 tags and usage', h3Search: 'Search tags or descriptions…', h3Empty: 'No matching H3 options', h3Close: 'Close H3 list', retention: 'Select reference retention', fully_preserved: 'Preserve defined features (e.g. identity and clothing)', partially_preserved: 'Keep some features and change others (e.g. remove a clothing logo)', attribute_transfer: 'Transfer features to another subject (e.g. apply a material to another character)', weak_reference: 'Borrow broad style or atmosphere (e.g. scene colors)', fully_copy: 'Reuse all audio (e.g. original soundtrack throughout)', partially_copy: 'Reuse part of the audio (e.g. one dialogue segment)', reference: 'Reference audio features (e.g. voice timbre for new dialogue)', audio_weak: 'Borrow broad audio character (e.g. similar ambience)', unavailable: 'Asset preview unavailable', remove: 'Remove asset reference', title: 'Select linked asset', search: 'Search asset names…', all: 'All', character: 'Characters', scene: 'Scenes', prop: 'Props', grid_storyboard: 'Storyboard grids', other: 'Other', empty: 'No matching assets', close: 'Close asset list' },
    ja: { dialogue: '台詞の言語を選択', h3: 'H3 タグと使い方', h3Search: 'タグ・説明を検索…', h3Empty: '一致する H3 項目なし', h3Close: 'H3 一覧を閉じる', retention: '参照の保持方法を選択', fully_preserved: '定義した特徴を保持（例：人物の外見と衣装）', partially_preserved: '一部を保持し他を変更（例：衣装のロゴを除去）', attribute_transfer: '別の対象へ特徴を転用（例：別の人物に素材感を適用）', weak_reference: '大まかな雰囲気を参考（例：背景の色調）', fully_copy: '音声全体を再利用（例：元の音声を全編で使用）', partially_copy: '音声の一部を再利用（例：一部の台詞）', reference: '音声の特徴を参考（例：声質を参考に新しい台詞）', audio_weak: '音の種類や雰囲気を参考（例：似た環境音）', unavailable: '素材プレビューがありません', remove: '素材参照を削除', title: '関連素材を選択', search: '素材名を検索…', all: 'すべて', character: 'キャラクター', scene: 'シーン', prop: '小道具', grid_storyboard: '絵コンテ', other: 'その他', empty: '一致する素材がありません', close: '素材一覧を閉じる' },
});

export function mentionQuery(value, cursor) {
    const match = value.slice(0, cursor).match(/@([^@\s\[\]()]{0,80})$/);
    return match ? { start: cursor - match[0].length, end: cursor, query: match[1] } : null;
}

export function retentionQuery(value, cursor) {
    const prefix = value.slice(0, cursor);
    const sections = [...prefix.matchAll(/^[ \t]*([a-z][a-z0-9_]*):/gm)];
    if (sections.at(-1)?.[1] !== 'retention_analysis') return null;
    const line = prefix.slice(prefix.lastIndexOf('\n') + 1);
    const match = line.match(/^[ \t]*<(Subject|Picture|Video|Audio) [1-9]\d*>(?:[ \t]+\([^\n)]*\))?:[ \t]+([a-z_]*)$/);
    if (!match) return null;
    const suffix = value.slice(cursor).match(/^[a-z_]*/)[0];
    return {start: cursor - match[2].length, end: cursor + suffix.length, query: match[2], kind: match[1]};
}

export function retentionOptions(kind) {
    const keys = kind === 'Audio' ? ['fully_copy', 'partially_copy', 'reference', 'weak_reference']
        : ['fully_preserved', 'partially_preserved', 'attribute_transfer', 'weak_reference'];
    return keys.map(name => ({name, file: T(kind === 'Audio' && name === 'weak_reference' ? 'audio_weak' : name)}));
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
            nav[hidden], input[hidden] {display:none}
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
        for (const key of ['all', 'character', 'scene', 'prop', 'grid_storyboard', 'other']) {
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
        let previous = assetMentionRanges(textarea.value, getAssets());
        textarea.addEventListener('input', event => {
            if (event.isComposing) return;
            const current = assetMentionRanges(textarea.value, getAssets());
            const ids = new Set(current.flatMap(range => range.assets.map(asset => asset.id)));
            for (const asset of previous.flatMap(range => range.assets)) {
                if (!ids.has(asset.id)) this.dispatchEvent(new CustomEvent('asset-mention-remove', {detail: asset}));
            }
            previous = current;
            for (const asset of current.flatMap(range => range.assets)) {
                this.dispatchEvent(new CustomEvent('asset-mention', {detail: asset}));
            }
        }, {signal});
        this.tags?.remove();
        this.tags = document.createElement('cap-inline-prompt');
        textarea.after(this.tags);
        const renderTags = () => this.tags.configure(textarea, getAssets());
        textarea.addEventListener('input', renderTags, {signal});
        textarea.addEventListener('change', renderTags, {signal});
        renderTags();
        const update = event => {
            if (event.isComposing || textarea.readOnly || textarea.disabled) { this.close(); return; }
            const h3 = h3Query(textarea.value, textarea.selectionStart);
            const retention = h3?.section === 'retention_analysis' ? retentionQuery(textarea.value, h3.start) : null;
            this.mode = retention ? 'retention' : h3 ? 'h3' : 'asset';
            this.match = h3 || mentionQuery(textarea.value, textarea.selectionStart);
            if (!this.match || textarea.selectionStart !== textarea.selectionEnd
                || assetMentionRanges(textarea.value, getAssets()).some(range => this.match.start === range.start && this.match.end === range.end)) { this.close(); return; }
            this.assets = retention ? retentionOptions(retention.kind) : h3 ? h3.options : getAssets();
            this.search.value = this.match.query;
            this.hidden = false;
            this.render();
            this.place();
        };
        textarea.addEventListener('input', update, {signal});
        textarea.addEventListener('compositionend', update, {signal});
        textarea.addEventListener('click', () => this.close(), {signal});
        textarea.addEventListener('keydown', this.onKey, {signal, capture:true});
        this.tags.addEventListener('keydown', this.onKey, {signal, capture:true});
        document.addEventListener('pointerdown', event => {
            if (!event.composedPath().includes(this) && event.target !== textarea) this.close();
        }, {signal});
        window.addEventListener('resize', () => this.close(), {signal});
        textarea.addEventListener('blur', event => {
            if (!this.contains(event.relatedTarget)) this.close();
        }, {signal});
    }

    connectedCallback() {
        this.hidden = true;
        if (this.controller?.signal.aborted) this.bind(this.textarea, this.getAssets);
    }
    disconnectedCallback() { this.controller?.abort(); this.tags?.remove(); }
    close() { this.hidden = true; }
    place() {
        const rect = (this.textarea._capInlineEditor || this.textarea).getBoundingClientRect();
        const height = Math.min(360, window.innerHeight - 24);
        this.style.maxHeight = `${height}px`;
        this.style.left = `${Math.max(12, Math.min(rect.left + 12, window.innerWidth - this.offsetWidth - 12))}px`;
        this.style.top = `${Math.max(12, Math.min(rect.top + 40, window.innerHeight - height - 12))}px`;
    }
    render() {
        const query = this.search.value.trim().toLocaleLowerCase();
        const retention = this.mode === 'retention' || this.mode === 'h3';
        this.search.hidden = this.mode === 'retention';
        this.search.placeholder = T(retention ? 'h3Search' : 'search');
        this.search.setAttribute('aria-label', this.search.placeholder);
        this.root.querySelector('header cap-button').setAttribute('aria-label', T(retention ? 'h3Close' : 'close'));
        this.root.querySelector('nav').hidden = retention;
        this.root.querySelector('strong').textContent = T(this.match?.dialogue ? 'dialogue' : this.mode === 'h3' ? 'h3' : retention ? 'retention' : 'title');
        this.root.querySelector('.list').setAttribute('aria-label', T(this.match?.dialogue ? 'dialogue' : this.mode === 'h3' ? 'h3' : retention ? 'retention' : 'title'));
        this.results = this.assets.filter(asset => (retention || this.category === 'all' || (asset.category || 'other') === this.category)
            && `${asset.name} ${retention ? asset.file : ''}`.toLocaleLowerCase().includes(query));
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
        if (!this.results.length) { const empty = document.createElement('p'); empty.textContent = T(retention ? 'h3Empty' : 'empty'); list.append(empty); }
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
        const retention = this.mode === 'retention' || this.mode === 'h3';
        const start = this.match.start;
        replaceRichPromptRange(ta, retention ? (asset.insert ?? asset.name) : `@${asset.name} `, this.match.start, this.match.end);
        if (retention && asset.caretOffset != null) ta.setSelectionRange(start + asset.caretOffset, start + asset.caretOffset);
        if (!retention) this.dispatchEvent(new CustomEvent('asset-mention', {detail:asset}));
        this.close();
    }
}
customElements.define('cap-prompt-mentions', PromptMentions);
