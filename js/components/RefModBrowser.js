import './Button.js';
import './FormControls.js';
import './StatusMessage.js';
import { makeT } from '../cap_i18n.js';
import { filterRefMods, refModAssets, refModPlaybackRate } from '../editor/RefMods.js';

export const refModT = makeT({
    zh: {title:'RefMod 参考库', insert:'插入 RefMod', search:'搜索名称、目录或描述…', all:'全部目录', empty:'没有匹配的 RefMod', missing:'请安装或启用 MiniMaxH3Mod，重启 ComfyUI 后刷新。', refresh:'刷新', select:'插入', bound:'当前 Clip 的 RefMod', strength:'强度', remove:'移除引用', preview:'暂无预览', rate:'RefMod 预览播放倍数', loading:'正在读取 RefMod…'},
    en: {title:'RefMod library', insert:'Insert RefMod', search:'Search name, folder or description…', all:'All folders', empty:'No matching RefMods', missing:'Enable MiniMaxH3Mod, restart ComfyUI, then refresh.', refresh:'Refresh', select:'Insert', bound:'RefMods for this Clip', strength:'Strength', remove:'Remove reference', preview:'No preview', rate:'RefMod preview playback speed', loading:'Loading RefMods…'},
    ja: {title:'RefMod ライブラリ', insert:'RefMod を挿入', search:'名前・フォルダ・説明を検索…', all:'全フォルダ', empty:'一致する RefMod がありません', missing:'MiniMaxH3Mod を有効にして ComfyUI を再起動してください。', refresh:'更新', select:'挿入', bound:'この Clip の RefMod', strength:'強度', remove:'参照を解除', preview:'プレビューなし', rate:'RefMod プレビュー再生速度', loading:'RefMod を読み込み中…'},
});

export class RefModBrowser extends HTMLElement {
    constructor() {
        super();
        this.rows = [];
        this.bindings = [];
        this.attachShadow({mode:'open'}).innerHTML = `<style>
            :host {display:block;color:var(--cat-text);font:inherit;min-width:0;}
            .body {padding:20px 28px;display:grid;gap:16px;}
            .filters {display:flex;gap:8px;flex-wrap:wrap;}
            input[type=search] {flex:1;min-width:100px;}
            input,select {padding:8px;color:inherit;background:var(--cat-input,var(--cat-bg));border:1px solid var(--cat-border-soft);border-radius:6px;font:inherit;}
            .grid {display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;}
            article {display:flex;flex-direction:column;gap:8px;padding:12px;min-width:0;border:1px solid var(--cat-border-soft);border-radius:6px;}
            .media {height:126px;display:grid;place-items:center;background:var(--cat-bg);color:var(--cat-muted);}
            video,img {width:100%;height:100%;object-fit:contain;}
            .name {overflow-wrap:anywhere;line-height:1.5;}
            .path,.description {color:var(--cat-muted);font-size:.85em;overflow-wrap:anywhere;}
            .description {max-height:4.8em;overflow:auto;}
            .bound {display:grid;gap:8px;} .bound[hidden] {display:none;}
            .binding {display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
            .binding span {flex:1;overflow-wrap:anywhere;min-width:80px;}
            .binding input[type=number] {width:60px;}
            :host([compact]) .body {padding:12px;gap:10px;}
            :host([compact]) .grid {display:flex;flex-direction:column;gap:8px;max-height:320px;overflow:auto;}
            :host([compact]) article {display:grid;grid-template-columns:88px minmax(0,1fr) auto;gap:8px;padding:8px;align-items:center;}
            :host([compact]) .media {height:58px;}
            :host([compact]) .description {display:none;}
            @media(max-width:550px) {.body {padding:16px 18px}.grid {grid-template-columns:1fr}}
        </style><div class="body"><div class="filters"><input type="search"><select></select><cap-button class="refresh" size="small"></cap-button></div><div class="bound" hidden></div><cap-status-message></cap-status-message><div class="grid"></div></div>`;
        this.search = this.shadowRoot.querySelector('input');
        this.folder = this.shadowRoot.querySelector('select');
        this.search.placeholder = refModT('search'); this.search.setAttribute('aria-label', refModT('search'));
        this.folder.setAttribute('aria-label', refModT('all'));
        this.search.oninput = () => this.render(); this.folder.onchange = () => this.render();
        this.status = this.shadowRoot.querySelector('cap-status-message');
        const refresh = this.shadowRoot.querySelector('.refresh'); refresh.textContent = refModT('refresh');
        refresh.onclick = () => void this.load(this.apiURL);
    }
    async load(apiURL) {
        this.apiURL = apiURL;
        this.controller?.abort(); this.controller = new AbortController();
        this.status.setStatus(refModT('loading'), 'info');
        try {
            const response = await fetch(apiURL('/refmods/library'), {cache:'no-store', signal:this.controller.signal});
            if (!response.ok) throw new Error(response.status === 404 ? refModT('missing') : `HTTP ${response.status}`);
            const rows = await response.json();
            this.rows = rows;
            const selected = this.folder.value;
            this.folder.replaceChildren(new Option(refModT('all'), ''));
            const folders = [...new Set(rows.flatMap(row => {
                const parts = row.name.split('/'); parts.pop();
                return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
            }))].sort();
            for (const folder of folders) this.folder.append(new Option(folder, folder));
            this.folder.value = folders.includes(selected) ? selected : '';
            this.status.hidden = true; this.render();
            this.dispatchEvent(new CustomEvent('refmod-library', {detail:{rows}, bubbles:true, composed:true}));
        } catch (error) {
            if (error.name !== 'AbortError') this.status.setStatus(error.message, 'error');
        }
    }
    stop() { this.shadowRoot.querySelectorAll('video').forEach(video => video.pause()); }
    focus(options) { this.search.focus(options); }
    connectedCallback() {
        if (this.hasAttribute('compact')) {
            this.outside = event => {if (!event.composedPath().includes(this)) this.remove();};
            document.addEventListener('pointerdown', this.outside);
        }
    }
    disconnectedCallback() { this.controller?.abort(); this.stop(); document.removeEventListener('pointerdown', this.outside); }
    setBindings(rows) {
        this.bindings = structuredClone(rows);
        const bound = this.shadowRoot.querySelector('.bound'); bound.replaceChildren();
        bound.hidden = this.hasAttribute('compact') || !rows.length;
        const title = document.createElement('strong'); title.textContent = refModT('bound'); bound.append(title);
        const update = () => this.dispatchEvent(new CustomEvent('refmod-change', {detail:{rows:structuredClone(this.bindings)}, bubbles:true, composed:true}));
        for (const row of this.bindings) {
            const item = document.createElement('div'); item.className = 'binding';
            const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = row.enabled !== false;
            enabled.setAttribute('aria-label', row.path); enabled.onchange = () => {row.enabled = enabled.checked; update();};
            const name = document.createElement('span'); name.textContent = row.path;
            const wrapper = document.createElement('cap-input');
            const strength = document.createElement('input'); strength.type = 'number'; strength.min = 0; strength.max = 1; strength.step = .05; strength.value = row.strength ?? 1;
            strength.setAttribute('aria-label', refModT('strength') + ' ' + row.path);
            strength.onchange = () => {if (strength.checkValidity()) {row.strength = Number(strength.value); update();}};
            wrapper.append(strength);
            const remove = document.createElement('cap-button'); remove.setAttribute('variant','danger'); remove.setAttribute('size','small'); remove.textContent = refModT('remove');
            remove.onclick = () => {this.bindings = this.bindings.filter(value => value.path !== row.path); update(); this.setBindings(this.bindings);};
            item.append(enabled, name, wrapper, remove); bound.append(item);
        }
    }
    render() {
        this.stop();
        const grid = this.shadowRoot.querySelector('.grid'); grid.replaceChildren();
        const rows = filterRefMods(this.rows, this.search.value, this.folder.value);
        const assets = refModAssets(rows, this.apiURL);
        if (!rows.length) {const empty = document.createElement('p'); empty.textContent = refModT('empty'); grid.append(empty);}
        for (const [index, row] of rows.entries()) {
            const card = document.createElement('article');
            const preview = document.createElement('div'); preview.className = 'media'; preview.textContent = refModT('preview');
            if (row.has_preview) {
                const media = document.createElement(row.preview_type === 'video' ? 'video' : 'img');
                media.src = assets[index].preview;
                if (row.preview_type === 'video') {
                    media.muted = true; media.loop = true; media.playsInline = true; media.preload = 'none';
                    card.onpointerenter = () => {media.playbackRate = refModPlaybackRate(); void media.play().catch(() => {});};
                    card.onpointerleave = () => media.pause();
                    card.onfocusin = card.onpointerenter; card.onfocusout = card.onpointerleave;
                } else {media.loading = 'lazy'; media.alt = row.name;}
                media.onerror = () => {preview.textContent = refModT('preview');}; preview.replaceChildren(media);
            }
            const info = document.createElement('div');
            const name = document.createElement('div'); name.className = 'name'; name.textContent = row.name.split('/').pop();
            const path = document.createElement('div'); path.className = 'path'; path.textContent = row.name;
            const description = document.createElement('div'); description.className = 'description'; description.textContent = row.description || '';
            info.append(name,path,description);
            const insert = document.createElement('cap-button'); insert.textContent = refModT('select'); insert.setAttribute('size','small');
            insert.onclick = () => this.dispatchEvent(new CustomEvent('refmod-select', {detail:{asset:assets[index]}, bubbles:true, composed:true}));
            card.append(preview, info, insert); grid.append(card);
        }
    }
}
customElements.define('cap-refmod-browser', RefModBrowser);
