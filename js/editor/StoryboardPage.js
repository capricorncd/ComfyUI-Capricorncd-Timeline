import '../components/StoryboardCard.js';
import '../components/StatusMessage.js';
import '../components/Dialog.js';
import { t as editorT } from '../i18n/timeline_editor.js';
import { makeT } from '../cap_i18n.js';
import { normalizeStoryboards, STORYBOARD_TEXT_FIELDS as TEXT_FIELDS } from './StoryboardDocument.js';
export { normalizeStoryboards } from './StoryboardDocument.js';

export const storyboardT = makeT({
    en: {
        above: 'Above', below: 'Below',
        bind: 'Bind clips', missing_clip: 'Missing clip', save: 'Save', bound: 'Bound: {names}',
        enable: 'Enable', disable: 'Disable', disabled: 'Disabled', delete: 'Delete',
        unset: 'Not set',
        more: 'More', insert: 'Insert shot', copy: 'Copy current shot',
        restart_required: 'Restart ComfyUI and refresh this page to load the storyboard input.',
        mode: 'Storyboard mode', playback: 'Playback mode', title: 'Storyboards', settings: 'Shot settings',
        add: 'Add shot', empty: 'No storyboards yet', select: 'Select a shot to edit', untitled: 'Untitled shot',
        from_clips: 'Generate from director clips', generated: 'Added {n} shots', no_clips: 'No director clips', already_generated: 'All director clips already have storyboards',
        name: 'Shot title', description: 'Picture / action', shot_size: 'Shot size', camera_move: 'Camera movement',
        duration: 'Duration (seconds)', speaker: 'Speaker', dialogue: 'Dialogue', emotion: 'Emotion', delivery: 'Voice / lip sync',
        image: 'Reference image', no_image: 'No image', seconds: 's', count: '{n} shots',
    },
    zh: {
        above: '上方', below: '下方',
        bind: '绑定 clip', missing_clip: 'clip 不存在', save: '保存', bound: '已绑定：{names}',
        enable: '启用', disable: '禁用', disabled: '已禁用', delete: '删除',
        unset: '未设置',
        more: '更多', insert: '插入分镜', copy: '是否复制当前分镜',
        restart_required: '请重启 ComfyUI 并刷新页面，以加载分镜存储字段。',
        mode: '分镜模式', playback: '播放模式', title: '分镜管理', settings: '分镜设置',
        add: '添加分镜', empty: '暂无分镜', select: '选择分镜进行编辑', untitled: '未命名分镜',
        from_clips: '从导演clip生成分镜', generated: '已添加 {n} 个分镜', no_clips: '暂无导演 clip', already_generated: '导演 clip 均已生成分镜',
        name: '分镜标题', description: '画面内容 / 人物动作', shot_size: '景别', camera_move: '运镜',
        duration: '时长（秒）', speaker: '说话人', dialogue: '台词', emotion: '语气', delivery: '声音表现',
        image: '参考图片', no_image: '无图片', seconds: '秒', count: '{n} 个分镜',
    },
    ja: {
        above: '上', below: '下',
        bind: 'クリップを関連付け', missing_clip: 'クリップが見つかりません', save: '保存', bound: '関連：{names}',
        enable: '有効化', disable: '無効化', disabled: '無効', delete: '削除',
        unset: '未設定',
        more: 'その他', insert: 'ショットを挿入', copy: '現在のショットをコピー',
        restart_required: '絵コンテ保存フィールドを読み込むため、ComfyUIを再起動してページを更新してください。',
        mode: '絵コンテモード', playback: '再生モード', title: '絵コンテ', settings: 'ショット設定',
        add: 'ショットを追加', empty: '絵コンテはありません', select: '編集するショットを選択', untitled: '無題のショット',
        from_clips: '演出クリップから生成', generated: '{n} ショットを追加しました', no_clips: '演出クリップはありません', already_generated: 'すべての演出クリップに絵コンテがあります',
        name: 'ショット名', description: '画面 / 動作', shot_size: 'ショットサイズ', camera_move: 'カメラワーク',
        duration: '長さ（秒）', speaker: '話者', dialogue: 'セリフ', emotion: '感情', delivery: '音声 / リップシンク',
        image: '参照画像', no_image: '画像なし', seconds: '秒', count: '{n} ショット',
    },
});
const T = storyboardT;
const SHOT_OPTIONS = {
    shot_size: ['远景', '全景', '中景', '近景', '特写'],
    camera_move: ['固定', '轻推', '拉远', '横移', '跟拍', '环绕'],
    speaker: ['柳云舒', '夜绮罗'],
    delivery: ['口型同步', '画外音 · 延续上句', '旁白'],
    emotion: ['平静，略带疑惑', '轻松调侃', '自然陈述'],
};

export class StoryboardPage {
    constructor({ onChange, onSelect, onGenerate, getClips = () => [] }) {
        this.getClips = getClips;
        this.onChange = onChange;
        this.onSelect = onSelect;
        this.items = [];
        this.selectedId = null;
        this.images = [];
        this.width = 16;
        this.height = 9;
        this.el = document.createElement('section');
        this.el.className = 'cat-te-storyboard';
        this.el.hidden = true;
        this.el.innerHTML = `<div class="cat-te-storyboard-toolbar"><span>${T('title')}</span><span data-count></span><cap-button data-add variant="accent">${T('add')}</cap-button><cap-button data-from-clips>${T('from_clips')}</cap-button></div><cap-status-message hidden></cap-status-message><div class="cat-te-storyboard-list"></div><p data-empty>${T('empty')}</p>`;
        this.el.querySelector('[data-from-clips]').addEventListener('click', () => {
            const { added, total } = onGenerate();
            this.el.querySelector('cap-status-message').setStatus(T(added ? 'generated' : total ? 'already_generated' : 'no_clips', { n: added }), added ? 'success' : 'info');
        });
        this.panel = document.createElement('div');
        this.panel.className = 'cat-te-storyboard-settings';
        this.panel.hidden = true;
        this.panel.innerHTML = `<p data-selection-empty>${T('select')}</p><form hidden>
            <label>${T('name')}<input name="title" type="text"></label>
            <label>${T('description')}<textarea name="description" rows="4"></textarea></label>
            <div class="cat-te-storyboard-pair"><label>${T('shot_size')}<select name="shot_size"></select></label><label>${T('camera_move')}<select name="camera_move"></select></label></div>
            <label>${T('duration')}<input name="duration" type="number" min="0.001" step="any" required></label>
            <label>${T('image')}<select name="image_id"></select></label>
            <div class="cat-te-storyboard-binding"><cap-button data-bind>${T('bind')}</cap-button><div data-bound-clips></div></div>
            <label>${T('speaker')}<select name="speaker"></select></label>
            <label>${T('dialogue')}<textarea name="dialogue" rows="3"></textarea></label>
            <label>${T('delivery')}<select name="delivery"></select></label>
            <label>${T('emotion')}<select name="emotion"></select></label>
        </form>`;
        this.form = this.panel.querySelector('form');
        this.panel.querySelector('[data-bind]').addEventListener('click', () => this.openBindDialog(this.selectedId));
        this.form.addEventListener('submit', event => event.preventDefault());
        this.form.addEventListener('change', event => {
            const input = event.target;
            const key = input.name;
            if (!TEXT_FIELDS.includes(key) && key !== 'duration') return;
            if (!input.reportValidity()) return;
            const value = key === 'duration' ? Number(input.value) : input.value;
            if (key === 'duration' && (!Number.isFinite(value) || value <= 0)) return;
            const shot = this.items.find(row => row.id === this.selectedId);
            if (!shot || shot[key] === value) return;
            this.onChange(this.items.map(row => row.id === shot.id ? { ...row, [key]: value } : row));
        });
        this.el.querySelector('[data-add]').addEventListener('click', () => {
            const shot = normalizeStoryboards([{}])[0];
            this.selectedId = shot.id;
            this.onChange([...this.items, shot]);
            this.onSelect();
            this.form.elements.title.focus();
        });
        this.el.addEventListener('shot-select', event => {
            this.selectedId = event.detail.id;
            this.render();
            this.onSelect();
        });
        this.fps = 24;
        this.el.addEventListener('shot-insert', event => this.openInsertDialog(event.detail.id));
        this.el.addEventListener('shot-toggle', event => {
            const shot = this.items.find(row => row.id === event.detail.id);
            if (!shot) return;
            this.onChange(this.items.map(row => row.id === shot.id ? { ...row, disabled: row.disabled !== true } : row));
        });
        this.el.addEventListener('shot-delete', event => {
            const index = this.items.findIndex(row => row.id === event.detail.id);
            if (index < 0) return;
            const items = this.items.filter(row => row.id !== event.detail.id);
            if (this.selectedId === event.detail.id) this.selectedId = items[Math.min(index, items.length - 1)]?.id ?? null;
            this.onChange(items);
            this.onSelect();
        });
    }

    openBindDialog(id) {
        const shot = this.items.find(row => row.id === id);
        if (!shot) return;
        const clips = this.getClips();
        const selected = new Set(shot.clip_ids || []);
        const choices = [...clips, ...[...selected].filter(id => !clips.some(clip => clip.id === id))
            .map(id => ({ id, name: T('missing_clip') }))];
        const dialog = document.createElement('cap-dialog');
        dialog.className = 'cat-te-bind-storyboard-dialog';
        dialog.setAttribute('close-label', editorT('close_title'));
        dialog.innerHTML = `<span slot="title">${T('bind')}</span><div class="cat-te-bind-storyboard-list"></div>
            <div slot="footer"><cap-button data-cancel>${editorT('cancel_btn')}</cap-button><cap-button data-save variant="primary">${T('save')}</cap-button></div>`;
        const list = dialog.querySelector('.cat-te-bind-storyboard-list');
        for (const clip of choices) {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = clip.id;
            input.checked = selected.has(clip.id);
            label.append(input, document.createTextNode(`${clip.name} · ${clip.id}`));
            list.append(label);
        }
        if (!choices.length) list.textContent = T('no_clips');
        dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
        dialog.querySelector('[data-save]').addEventListener('click', () => {
            const current = this.items.find(row => row.id === id);
            const clip_ids = [...list.querySelectorAll('input:checked')].map(input => input.value);
            if (current && JSON.stringify(current.clip_ids || []) !== JSON.stringify(clip_ids)) {
                this.onChange(this.items.map(row => row.id === id ? { ...row, clip_ids } : row));
            }
            dialog.close();
        });
        dialog.addEventListener('close', () => dialog.remove(), { once: true });
        this.el.append(dialog);
        dialog.showModal();
    }

    openInsertDialog(id) {
        const source = this.items.find(shot => shot.id === id);
        if (!source) return;
        const fps = this.fps;
        const dialog = document.createElement('cap-dialog');
        dialog.className = 'cat-te-insert-storyboard-dialog';
        dialog.setAttribute('close-label', editorT('close_title'));
        dialog.innerHTML = `<span slot="title">${T('insert')}</span>
            <div class="cat-te-insert-storyboard-body">
            <fieldset><legend>${editorT('insert_clip_position')}</legend>
              <label><input type="radio" name="insert-position" value="before">${T('above')}</label>
              <label><input type="radio" name="insert-position" value="after" checked>${T('below')}</label>
            </fieldset>
            <fieldset><legend>${T('copy')}</legend>
              <label><input type="radio" name="insert-copy" value="yes" checked>${editorT('insert_clip_yes')}</label>
              <label><input type="radio" name="insert-copy" value="no">${editorT('insert_clip_no')}</label>
            </fieldset>
            <div class="cat-te-insert-duration"><label>${T('duration')} <input data-seconds type="number" min="0" step="1" required> ${editorT('insert_clip_seconds')}</label>
              <label><input data-frames type="number" min="0" max="${Math.ceil(fps) - 1}" step="1" required> ${editorT('insert_clip_frames')}</label></div>
            <p data-error role="status"></p></div>
            <div slot="footer"><cap-button data-cancel>${editorT('cancel_btn')}</cap-button><cap-button data-confirm variant="primary">${editorT('insert_clip_confirm')}</cap-button></div>`;
        const seconds = dialog.querySelector('[data-seconds]');
        const frames = dialog.querySelector('[data-frames]');
        const setDuration = duration => {
            seconds.value = Math.floor(duration);
            frames.value = Math.round((duration - Math.floor(duration)) * fps);
            if (Number(frames.value) >= fps) { seconds.value = Number(seconds.value) + 1; frames.value = 0; }
        };
        setDuration(source.duration);
        for (const input of dialog.querySelectorAll('[name="insert-copy"]')) input.addEventListener('change', () => {
            setDuration(dialog.querySelector('[name="insert-copy"]:checked').value === 'yes' ? source.duration : 5);
        });
        dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
        dialog.querySelector('[data-confirm]').addEventListener('click', () => {
            if (!seconds.reportValidity() || !frames.reportValidity()) return;
            const duration = Math.round((Number(seconds.value) + Number(frames.value) / fps) * fps) / fps;
            if (!Number.isFinite(duration) || duration <= 0) {
                dialog.querySelector('[data-error]').textContent = editorT('insert_clip_invalid_duration');
                return;
            }
            const index = this.items.findIndex(shot => shot.id === id);
            if (index < 0) { dialog.close(); return; }
            const copy = dialog.querySelector('[name="insert-copy"]:checked').value === 'yes';
            const before = dialog.querySelector('[name="insert-position"]:checked').value === 'before';
            const shot = normalizeStoryboards([copy ? structuredClone(this.items[index]) : {}])[0];
            shot.id = crypto.randomUUID();
            shot.duration = duration;
            delete shot.source_clip_id;
            const items = [...this.items];
            items.splice(index + (before ? 0 : 1), 0, shot);
            this.selectedId = shot.id;
            this.onChange(items);
            this.onSelect();
            dialog.close();
            this.form.elements.title.focus();
        });
        dialog.addEventListener('close', () => dialog.remove(), { once: true });
        this.el.append(dialog);
        dialog.showModal();
    }

    setItems(items) {
        this.items = items;
        if (!items.some(row => row.id === this.selectedId)) this.selectedId = null;
        this.render();
    }

    configure({ width, height, images, fps = 24 }) {
        this.fps = fps;
        this.width = width;
        this.height = height;
        this.images = images;
        this.render();
    }

    render() {
        const clips = new Map(this.getClips().map(clip => [clip.id, clip.name]));
        const list = this.el.querySelector('.cat-te-storyboard-list');
        const existing = new Map([...list.children].map(card => [card.shotId, card]));
        const cards = this.items.map((shot, index) => {
            const card = existing.get(shot.id) || document.createElement('cap-storyboard-card');
            card.setShot(shot, { index, selected: shot.id === this.selectedId, width: this.width, height: this.height,
                imageUrl: this.images.find(image => image.id === shot.image_id)?.url || '',
                bindings: shot.clip_ids?.length ? T('bound', { names: shot.clip_ids.map(id => clips.get(id) || id).join('、') }) : '',
                labels: { untitled: T('untitled'), seconds: T('seconds'), noImage: T('no_image'),
                    more: T('more'), insert: T('insert'), enable: T('enable'), disable: T('disable'),
                    disabled: T('disabled'), delete: T('delete') } });
            return card;
        });
        // Keep the focused card in place when editing or selecting a shot.
        for (const card of [...list.children]) if (!cards.includes(card)) card.remove();
        cards.forEach((card, i) => { if (list.children[i] !== card) list.insertBefore(card, list.children[i] || null); });
        this.el.querySelector('[data-empty]').hidden = !!this.items.length;
        this.el.querySelector('[data-count]').textContent = T('count', { n: this.items.length });
        const selected = this.items.find(row => row.id === this.selectedId);
        this.form.hidden = !selected;
        this.panel.querySelector('[data-selection-empty]').hidden = !!selected;
        if (!selected) return;
        this.panel.querySelector('[data-bound-clips]').textContent = (selected.clip_ids || []).map(id => clips.get(id) || id).join('、');
        for (const [key, defaults] of Object.entries(SHOT_OPTIONS)) {
            const values = [...new Set([...defaults, ...this.items.map(shot => shot[key]).filter(Boolean)])];
            this.form.elements[key].replaceChildren(new Option(T('unset'), ''), ...values.map(value => new Option(value, value)));
        }
        const select = this.form.elements.image_id;
        select.replaceChildren(new Option(T('no_image'), ''), ...this.images.map(image => new Option(image.name, image.id)));
        if (selected.image_id && !this.images.some(image => image.id === selected.image_id)) select.add(new Option(selected.image_id, selected.image_id));
        for (const key of [...TEXT_FIELDS, 'duration']) this.form.elements[key].value = selected[key];
    }
}
