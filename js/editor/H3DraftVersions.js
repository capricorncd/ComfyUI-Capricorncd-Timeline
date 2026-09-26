import '../components/Dialog.js';
import '../components/FormControls.js';
import '../components/StatusMessage.js';
import { makeT } from '../cap_i18n.js';

export const draftT = makeT({
    en: {
        generate_all: "Batch preview sampling — all clips", generate_selected: "Batch preview sampling — selected clips",
        title: 'Preview sampling manager', generate: 'Batch preview sampling',
        empty: 'No first-pass versions. Generate candidates to save low-resolution previews and their latents.',
        hint: 'Run automatically refines the latest valid preview latent. Disabled versions remain available for preview. Deleting only removes the Clip association; video, latent and metadata files are kept.',
        enabled: 'Enabled', disabled: 'Disabled', remove: 'Remove version', close: 'Close',
        no_video: 'Preview video is unavailable.', unavailable: 'Connect H3 Video Generator to this Timeline Editor first.',
        failed: 'Could not run: {message}', prompt: 'Preview sampling prompt', delete_failed: 'Could not delete: {message}', removed: 'Remove this version from the Clip? Video, latent and metadata files will be kept. Undo restores the association.',
    },
    zh: {
        generate_all: "全部片段批量预览采样", generate_selected: "选中片段批量预览采样",
        title: '预览采样管理', generate: '批量预览采样',
        empty: '暂无预览采样。批量预览采样后，这里会保存低清预览与对应的 latent。',
        hint: '运行时自动使用最新有效预览的 latent 进行二次采样。禁用后仍可预览；删除仅移除 Clip 关联，保留视频、latent 和版本信息文件。',
        enabled: '启用', disabled: '已禁用', remove: '删除版本', close: '关闭',
        no_video: '预览视频不可用。', unavailable: '请先将 H3 Video Generator 连接到当前时间轴编辑器。',
        failed: '运行失败：{message}', prompt: '预览采样提示词', delete_failed: '删除失败：{message}', removed: '从 Clip 删除此版本关联？磁盘上的视频、latent 和版本信息均会保留，可通过撤销恢复关联。',
    },
    ja: {
        generate_all: "全クリップのプレビューバッチ生成", generate_selected: "選択クリップのプレビューバッチ生成",
        title: 'プレビューサンプリング管理', generate: 'プレビューバッチ生成',
        empty: '候補はまだありません。低解像度プレビューと latent を生成してください。',
        hint: '実行時は最新の有効なプレビュー latent から二次生成します。無効な候補も再生できます。削除は Clip との関連付けのみで、動画・latent・バージョン情報は保持されます。',
        enabled: '有効', disabled: '無効', remove: '候補を削除', close: '閉じる',
        no_video: 'プレビュー動画がありません。', unavailable: 'H3 Video Generator をこのタイムラインに接続してください。',
        failed: '実行失敗：{message}', prompt: 'プレビューのプロンプト', delete_failed: '削除失敗：{message}', removed: 'この候補と Clip の関連付けを削除しますか？動画・latent・バージョン情報は保持され、取り消しで関連付けを復元できます。',
    },
});

export class H3DraftVersions {
    constructor(editor, host) {
        this.editor = editor;
        this.dialog = document.createElement('cap-dialog');
        this.dialog.className = 'cat-te-h3-drafts';
        this.dialog.setAttribute('close-label', draftT('close'));
        host.append(this.dialog);
        this.dialog.addEventListener('close', () => this.stop());
    }

    stop() {
        this.dialog.querySelectorAll('video').forEach(video => video.pause());
    }

    open(clip) {
        if (!clip) return;
        this.clipId = clip.id;
        this.previewId = null;
        this.render();
        if (!this.dialog.open) this.dialog.show();
    }

    change(update, clipId = this.clipId) {
        const clip = this.editor._findClipById(clipId);
        if (!clip || clip.track?.locked) return;
        this.editor._recordUndo();
        update(this.editor._ensureClipMeta(clip));
        this.editor._saveToWidgets();
        if (this.editor._selClip?.id === clip.id) {
            this.editor._setVisualSettingsEnabled(true, this.editor._ensureClipMeta(clip));
        }
        this.render();
    }

    render() {
        const clip = this.editor._findClipById(this.clipId);
        if (!clip) { this.dialog.close(); return; }
        const meta = this.editor._ensureClipMeta(clip);
        const rows = meta.h3Drafts || [];
        const current = rows.find(row => row.id === this.previewId) || rows[0];
        this.stop();
        this.dialog.replaceChildren();
        const title = document.createElement('span');
        title.slot = 'title';
        title.textContent = `${clip.name || clip.id} · ${draftT('title')}`;
        const body = document.createElement('div');
        body.className = 'cat-te-h3-drafts-body';
        const hint = document.createElement('p');
        hint.className = 'cat-te-h3-drafts-hint';
        hint.textContent = draftT(rows.length ? 'hint' : 'empty');
        body.append(hint);
        const layout = document.createElement('div');
        layout.className = 'cat-te-h3-drafts-layout';
        const list = document.createElement('div');
        list.className = 'cat-te-h3-drafts-list';
        for (const row of rows) {
            const card = document.createElement('div');
            card.className = 'cat-te-h3-draft-row';
            const label = document.createElement('label');
            const enabled = document.createElement('input');
            enabled.type = 'checkbox';
            enabled.checked = row.enabled !== false;
            enabled.disabled = !!clip.track?.locked;
            enabled.addEventListener('change', () => this.change(m => {
                m.h3Drafts = m.h3Drafts.map(item => item.id === row.id ? {...item, enabled: enabled.checked} : item);
            }));
            label.append(enabled, document.createTextNode(draftT(row.enabled === false ? 'disabled' : 'enabled')));
            const view = document.createElement('cap-button');
            view.setAttribute('align', 'start');
            view.setAttribute('truncate', '');
            view.setAttribute('aria-pressed', String(current?.id === row.id));
            view.textContent = `${row.width} × ${row.height} · seed ${row.seed}`;
            view.title = view.textContent;
            view.addEventListener('click', () => { this.previewId = row.id; this.render(); });
            const actions = document.createElement('div');
            actions.className = 'cat-te-h3-draft-actions';
            const remove = document.createElement('cap-button');
            remove.setAttribute('size', 'small');
            remove.setAttribute('variant', 'danger');
            remove.textContent = draftT('remove');
            remove.disabled = !!clip.track?.locked;
            remove.addEventListener('click', async () => {
                remove.disabled = true;
                try {
                    if (!await this.editor._confirmDraftRemoval()) return;
                    if (this.editor._findClipById(clip.id) !== clip || clip.track?.locked) return;
                    this.change(m => {
                        m.h3DraftRemoved = [...(m.h3DraftRemoved || []), row.id];
                        m.h3Drafts = m.h3Drafts.filter(item => item.id !== row.id);
                    }, clip.id);
                } catch (error) {
                    alert(draftT('delete_failed', {message: error.message}));
                } finally {
                    this.render();
                }
            });
            actions.append(remove);
            card.append(view, label, actions);
            list.append(card);
        }
        layout.append(list);
        if (current) {
            const detail = document.createElement('div');
            detail.className = 'cat-te-h3-draft-detail';
            const video = document.createElement('video');
            video.controls = true;
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.preload = 'metadata';
            const status = document.createElement('cap-status-message');
            if (current.file) video.src = this.editor._outputVideoUrl(current.file);
            else { video.hidden = true; status.setStatus(draftT('no_video')); }
            video.addEventListener('error', () => status.setStatus(draftT('no_video'), 'error'));
            const heading = document.createElement('h4');
            heading.textContent = draftT('prompt');
            const prompt = document.createElement('div');
            prompt.className = 'cat-te-h3-draft-prompt';
            prompt.textContent = current.prompt || '';
            detail.append(video, status, heading, prompt);
            layout.append(detail);
        }
        body.append(layout);
        const footer = document.createElement('div');
        footer.slot = 'footer';
        footer.className = 'cat-te-h3-draft-actions';
        for (const action of ['draft']) {
            const button = document.createElement('cap-button');
            button.textContent = draftT('generate');
            button.disabled = !!clip.track?.locked;
            button.addEventListener('click', async () => {
                button.disabled = true;
                try { await this.editor._runH3Stage(clip, action); }
                catch (error) { alert(draftT("failed", {message: error.message})); }
                finally { if (button.isConnected) button.disabled = false; }
            });
            footer.append(button);
        }
        this.dialog.append(title, body, footer);
    }
}
