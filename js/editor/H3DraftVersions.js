import { showCapAlert } from "../cap_ui.js";
import '../components/Dialog.js';
import '../components/FormControls.js';
import '../components/StatusMessage.js';
import '../components/ExportDirectory.js';
import { iconHtml } from '../cap_icons.js';
import { makeT } from '../cap_i18n.js';
import { t as T } from '../i18n/timeline_editor.js';

export const draftT = makeT({
    en: {
        associate: 'Associate existing folder', no_match: 'No preview versions belonging to this Clip were found.', hd: 'Generate HD', segment: 'Keyframe {interval} · part {part}/{parts}', start: 'Clip start {time}',
        previous_clip: 'Previous Clip', next_clip: 'Next Clip',
        playback_mode: "Preview versions", playback_hint: "Play preview versions along the timeline (latest enabled version per Clip)", playback_exit: "Exit preview version playback",
        generate_all: "Batch preview sampling — all clips", generate_selected: "Batch preview sampling — selected clips",
        title: 'Preview sampling manager', generate: 'Batch preview sampling',
        empty: 'No first-pass versions. Generate candidates to save low-resolution previews and their latents.',
        hint: 'Run automatically refines the latest valid preview latent. Disabled versions remain available for preview. Deleting moves video, latent and metadata to the recycle bin and cannot be undone with Ctrl+Z.',
        enabled: 'Enabled', disabled: 'Disabled', remove: 'Remove version', close: 'Close',
        no_video: 'Preview video is unavailable.', unavailable: 'Connect H3 Video Generator to this Timeline Editor first.',
        failed: 'Could not run: {message}', prompt: 'Preview sampling prompt', delete_failed: 'Could not delete: {message}', removed: 'Move this version’s video, latent and metadata files to the system recycle bin? Ctrl+Z cannot restore them. Restore all files manually from the recycle bin, then use Associate existing folder to link the version again.',
    },
    zh: {
        associate: '关联已有文件夹', no_match: '此文件夹没有属于当前 Clip 的预览版本。', hd: '生成高清版', segment: '关键帧区间 {interval} · 第 {part}/{parts} 段', start: 'Clip 内开始 {time}',
        previous_clip: '上一个 Clip', next_clip: '下一个 Clip',
        playback_mode: "预览版模式", playback_hint: "沿时间轴播放各 Clip 最新启用的预览版", playback_exit: "退出预览版播放模式",
        generate_all: "全部片段批量预览采样", generate_selected: "选中片段批量预览采样",
        title: '预览采样管理', generate: '批量预览采样',
        empty: '暂无预览采样。批量预览采样后，这里会保存低清预览与对应的 latent。',
        hint: '运行时自动使用最新有效预览的 latent 进行二次采样。禁用后仍可预览；删除会将视频、latent 和版本信息移入回收站，不支持 Ctrl+Z。',
        enabled: '启用', disabled: '已禁用', remove: '删除版本', close: '关闭',
        no_video: '预览视频不可用。', unavailable: '请先将 H3 Video Generator 连接到当前时间轴编辑器。',
        failed: '运行失败：{message}', prompt: '预览采样提示词', delete_failed: '删除失败：{message}', removed: '删除此版本并将视频、latent 和版本信息文件移入系统回收站？此操作不支持 Ctrl+Z。需要手动从回收站还原全部文件，再使用「关联已有文件夹」重新关联。',
    },
    ja: {
        associate: '既存フォルダーを関連付け', no_match: 'この Clip のプレビューが見つかりません。', hd: '高解像度版を生成', segment: 'キーフレーム {interval} · {part}/{parts}', start: 'Clip 内開始 {time}',
        previous_clip: '前の Clip', next_clip: '次の Clip',
        playback_mode: "プレビュー版モード", playback_hint: "各 Clip の最新の有効なプレビューをタイムラインで再生", playback_exit: "プレビュー版モードを終了",
        generate_all: "全クリップのプレビューバッチ生成", generate_selected: "選択クリップのプレビューバッチ生成",
        title: 'プレビューサンプリング管理', generate: 'プレビューバッチ生成',
        empty: '候補はまだありません。低解像度プレビューと latent を生成してください。',
        hint: '実行時は最新の有効なプレビュー latent から二次生成します。無効な候補も再生できます。削除すると動画・latent・バージョン情報をごみ箱に移動します。Ctrl+Z では復元できません。',
        enabled: '有効', disabled: '無効', remove: '候補を削除', close: '閉じる',
        no_video: 'プレビュー動画がありません。', unavailable: 'H3 Video Generator をこのタイムラインに接続してください。',
        failed: '実行失敗：{message}', prompt: 'プレビューのプロンプト', delete_failed: '削除失敗：{message}', removed: '動画・latent・バージョン情報をごみ箱に移動しますか？Ctrl+Z は使えません。すべてのファイルをごみ箱から手動で復元し、「既存フォルダーを関連付け」で再登録してください。',
    },
});

export function draftStartTime(row) {
    const part = row.keyframe_segment;
    const fps = Math.max(1, Math.round(Number(part?.fps || row.fps) || 24));
    const frames = Math.max(0, Math.round(Number(part?.start_frame) || 0));
    const seconds = Math.floor(frames / fps);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${String(frames % fps).padStart(2, '0')}`;
}

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

    open(clip, interval = null) {
        if (!clip) return;
        this.clipId = clip.id;
        this.interval = interval;
        this.previewId = null;
        this.render();
        if (!this.dialog.open) this.dialog.show();
    }

    clips() {
        return (this.editor._timeline?.tracks || [])
            .filter(track => String(track.type).toLowerCase() === 'image')
            .flatMap(track => [...track.clips].sort((a, b) => a.startTime - b.startTime || String(a.id).localeCompare(String(b.id))));
    }

    followSelection(clip) {
        if (!this.dialog.open || !clip || this.clipId === clip.id
            || String(clip.track?.type).toLowerCase() !== 'image') return;
        this.open(clip);
    }

    step(delta) {
        const clips = this.clips();
        const index = clips.findIndex(clip => clip.id === this.clipId);
        const next = index >= 0 ? clips[index + delta] : null;
        if (!next) return;
        this.editor._timeline.selectClip(next);
        this.followSelection(next);
    }

    change(update, clipId = this.clipId, undo = true) {
        const clip = this.editor._findClipById(clipId);
        if (!clip || (undo && clip.track?.locked)) return;
        if (undo) this.editor._recordUndo();
        update(this.editor._ensureClipMeta(clip));
        this.editor._saveToWidgets();
        if (this.editor._selClip?.id === clip.id) {
            this.editor._setVisualSettingsEnabled(true, this.editor._ensureClipMeta(clip));
        }
        this.render();
    }

    associate(clip) {
        const dialog = document.createElement('cap-dialog');
        const title = document.createElement('span'); title.slot = 'title'; title.textContent = draftT('associate');
        const body = document.createElement('div'); body.className = 'cat-te-h3-drafts-body';
        const directory = document.createElement('cap-export-directory');
        directory.setAttribute('project-directory', '');
        directory.setAttribute('label', draftT('associate'));
        directory.setAttribute('default-dir', 'capricorncd-timeline/h3_drafts');
        const status = document.createElement('cap-status-message');
        body.append(directory, status);
        const footer = document.createElement('div'); footer.slot = 'footer';
        const button = document.createElement('cap-button'); button.textContent = draftT('associate');
        button.setAttribute('variant', 'primary'); footer.append(button);
        const openGen = this.editor._openGen;
        button.onclick = async () => {
            button.disabled = true;
            dialog.closeDisabled = true;
            try {
                const result = await this.editor._requestH3DraftFiles('associate', {directory: directory.directory, clip_id: clip.id});
                if (this.editor._openGen !== openGen || this.editor._findClipById(clip.id) !== clip || clip.track?.locked) return;
                if (!result.versions.length) { status.setStatus(draftT('no_match'), 'warning'); return; }
                this.change(meta => {
                    const ids = new Set(result.versions.map(row => row.id));
                    for (const id of ids) this.editor._deletedH3DraftIds?.delete(id);
                    meta.h3DraftRemoved = (meta.h3DraftRemoved || []).filter(id => !ids.has(id));
                    meta.h3Drafts = [...result.versions.map(row => ({...row, enabled: true})), ...(meta.h3Drafts || []).filter(row => !ids.has(row.id))];
                }, clip.id);
                dialog.close();
            } catch (error) { status.setStatus(error.message, 'error'); }
            finally { button.disabled = false; dialog.closeDisabled = false; }
        };
        dialog.append(title, body, footer);
        this.editor._overlay.append(dialog);
        dialog.addEventListener('close', () => dialog.remove(), {once: true});
        dialog.showModal();
    }

    rows(clip, interval = this.interval) {
        return (this.editor._ensureClipMeta(clip).h3Drafts || []).filter(row => {
            if (!interval) return true;
            const part = row.keyframe_segment;
            return part && part.fps === interval.fps && part.start_frame >= interval.start_frame
                && part.end_frame <= interval.end_frame;
        });
    }

    render() {
        const clip = this.editor._findClipById(this.clipId);
        if (!clip) { this.dialog.close(); return; }
        const rows = [...this.rows(clip)].sort((a, b) => (a.keyframe_segment?.start_frame || 0) / (a.keyframe_segment?.fps || a.fps || 24) - (b.keyframe_segment?.start_frame || 0) / (b.keyframe_segment?.fps || b.fps || 24));
        const current = rows.find(row => row.id === this.previewId) || rows[0];
        this.stop();
        this.dialog.replaceChildren();
        const title = document.createElement('span');
        title.className = 'cat-te-h3-drafts-title';
        title.textContent = `${clip.name || clip.id} · ${draftT('title')}`;
        const header = document.createElement('div');
        header.slot = 'title';
        header.className = 'cat-te-h3-draft-actions';
        const clips = this.clips();
        const index = clips.findIndex(item => item.id === clip.id);
        header.append(title);
        for (const [delta, key, icon] of [[-1, 'previous_clip', 'chevronLeft'], [1, 'next_clip', 'chevronRight']]) {
            const button = document.createElement('cap-button');
            button.setAttribute('shape', 'square');
            button.setAttribute('size', 'small');
            button.title = draftT(key);
            button.setAttribute('aria-label', button.title);
            button.innerHTML = iconHtml(icon, 16);
            button.disabled = !!this.interval || index < 0 || !clips[index + delta];
            button.addEventListener('click', () => this.step(delta));
            header.append(button);
        }
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
            card.classList.toggle('is-playing', current?.id === row.id);
            card.addEventListener('click', event => {
                if (event.target.closest('cap-button, input, label')) return;
                this.previewId = row.id; this.render();
            });
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
                    this.stop();
                    await this.editor._requestH3DraftFiles('delete', {id: row.id});
                    this.editor._deletedH3DraftIds ||= new Set();
                    this.editor._deletedH3DraftIds.add(row.id);
                    this.change(m => {
                        m.h3DraftRemoved = [...(m.h3DraftRemoved || []), row.id];
                        m.h3Drafts = m.h3Drafts.filter(item => item.id !== row.id);
                    }, clip.id, false);
                } catch (error) {
                    showCapAlert(draftT('delete_failed', {message: error.message}));
                } finally {
                    this.render();
                }
            });
            const folder = document.createElement('cap-button');
            folder.setAttribute('size', 'small');
            folder.textContent = T('open_folder_btn');
            folder.disabled = !row.file;
            folder.addEventListener('click', async () => {
                folder.disabled = true;
                try { await this.editor._revealOutput({ filename: row.file }); }
                finally { folder.disabled = !row.file; }
            });
            const details = document.createElement('cap-button');
            details.setAttribute('size', 'small');
            details.textContent = T('project_video_details');
            details.addEventListener('click', () => {
                this.stop();
                this.editor._openProjectVideoDetails(row, {
                    clip_id: String(clip.id), seed: row.seed, keyframe_segment: row.keyframe_segment,
                    prompts: [{id: 'h3_clip_prompt', name: 'prompt', text: row.prompt || ''}],
                });
            });
            actions.append(details, folder, remove);
            const timing = document.createElement('div');
            const part = row.keyframe_segment;
            timing.textContent = (part ? draftT('segment', part) + ' · ' : '') + draftT('start', {time: draftStartTime(row)});
            card.append(timing, view, label, actions);
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
        if (current?.prompt) {
            const restore = document.createElement('cap-button');
            const update = {id: String(clip.id), text: current.prompt, segment: current.keyframe_segment};
            restore.textContent = T('video_prompts_restore');
            restore.title = T('video_prompts_restore_hint');
            restore.disabled = !this.editor._generatedPromptTarget(update);
            restore.addEventListener('click', () => {
                const count = this.editor._fillGeneratedPrompts([update]);
                restore.textContent = T('video_prompts_restored', {n: count});
            });
            footer.append(restore);
        }
        const associate = document.createElement('cap-button');
        associate.textContent = draftT('associate'); associate.disabled = !!clip.track?.locked;
        associate.addEventListener('click', () => this.associate(clip));
        footer.append(associate);
        for (const action of ['draft', 'normal']) {
            const button = document.createElement('cap-button');
            button.textContent = draftT(action === 'draft' ? 'generate' : 'hd');
            button.disabled = !!clip.track?.locked;
            button.addEventListener('click', async () => {
                button.disabled = true;
                try {
                    if (this.interval) {
                        const {fps, reference, ...interval} = this.interval;
                        await this.editor._runAllActiveClipsDownstream({clips: [clip], h3Generation: {action,
                            keyframe_runs: [{clip_id: String(clip.id), clip_start_ms: Math.round(clip.startTime * 1000), fps,
                                ...(reference ? {reference} : {}), intervals: [interval]}]}});
                    } else await this.editor._runH3Stage(clip, action);
                }
                catch (error) { showCapAlert(draftT("failed", {message: error.message})); }
                finally { if (button.isConnected) button.disabled = false; }
            });
            footer.append(button);
        }
        this.dialog.append(header, body, footer);
    }
}
