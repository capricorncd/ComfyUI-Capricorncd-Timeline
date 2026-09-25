import { iconHtml } from '../cap_icons.js';
import { api } from '../../../scripts/api.js';
import { t as T } from '../i18n/timeline_editor.js';
import '../components/Dialog.js';
import '../components/ExportRange.js';
import '../components/StatusMessage.js';
import { formatTimecode } from '../timecode.js';
import { shotPrompt } from '../components/ShotControl.js';

export function videoFrameSeekTime(frame, fps) {
    // MP4 time bases can round a frame's PTS slightly past frame / fps.
    return frame / fps + 0.0001;
}

export function videoTrimSource(app, item) {
    const trim = app._findMediaById(item.id)?.video_trim;
    if (!trim) return { item, start: 0, duration: null, rate: 1 };
    const original = app._findMediaById(trim.source_id);
    if (!original) throw new Error(T('asset_missing_cannot_preview'));
    return { item: original, start: trim.start, duration: trim.duration, rate: trim.rate };
}

export async function cutVideo(app, item, start, duration, rate = 1) {
    const media = app._findMediaById(item.id);
    const location = app._mediaStatus.get(`video:${item.file}`)?.location || media?.location || 'input';
    const response = await api.fetchApi('/audio_keyframe_timeline/trim_video', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: item.file, location, start, duration, rate }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return { file: result.file, trim: { source_id: item.id, start, duration, rate } };
}

export class VideoTrim {
    constructor(app, host) {
        this.app = app;
        this.dialog = document.createElement('cap-dialog');
        this.dialog.className = 'cat-te-video-trim-dialog';
        host.append(this.dialog);
        this.dialog.addEventListener('close', () => {
            this._saveShotDrafts?.();
            this._saveShotDrafts = null;
            this.stop();
        });
    }

    stop() {
        const video = this.dialog.querySelector('video');
        if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    }

    progress(active) {
        this.dialog.closeDisabled = active;
        if (!active) { this.dialog.close(); return; }
        this.dialog.innerHTML = `<span slot="title">${T('convert_to_director_clip')}</span><p>${T('composing_please_wait')}</p>`;
        this.dialog.showModal();
    }

    open(clip) {
        if (this.busy || clip.track.locked) return;
        const app = this.app;
        const items = app._clipItems(app._ensureClipMeta(clip));
        const videos = items.map((item, index) => ({item, index})).filter(row => row.item.kind === 'video');
        if (!videos.length) return;
        const dialog = this.dialog;
        dialog.innerHTML = `<span slot="title">${T('trim_reference_video')}</span>
            <div class="cat-te-video-trim-body">
            <div class="cat-te-video-trim-navigation">
                <cap-button data-prev shape="square" aria-label="${T('trim_video_previous')}">${iconHtml('chevronLeft', 'cat-te-icon')}</cap-button>
                <label>${T('trim_video_clip_asset')}<select data-asset></select></label>
                <span data-position></span>
                <cap-button data-next shape="square" aria-label="${T('trim_video_next')}">${iconHtml('chevronRight', 'cat-te-icon')}</cap-button>
            </div>
            <label>${T('trim_video_original')}<select data-source></select></label>
            <div class="cat-te-video-trim-stage"><video preload="metadata"></video></div>
            <div class="cat-te-video-trim-summary"></div>
            <cap-export-range hide-current-time></cap-export-range><cap-shot-control><cap-button slot="actions" data-insert>${T('shot_insert')}</cap-button></cap-shot-control><cap-status-message></cap-status-message></div>
            <div slot="footer"><cap-button data-cancel>${T('cancel_btn')}</cap-button><cap-button data-resize>${T('trim_apply_resize')}</cap-button><cap-button data-save variant="primary">${T('apply_btn')}</cap-button></div>`;
        const select = dialog.querySelector('[data-asset]');
        const previous = dialog.querySelector('[data-prev]');
        const next = dialog.querySelector('[data-next]');
        const position = dialog.querySelector('[data-position]');
        dialog.querySelector('.cat-te-video-trim-navigation').hidden = videos.length === 1;
        const updateNavigation = () => {
            const index = videos.findIndex(row => row.index === Number(select.value));
            position.textContent = `${index + 1} / ${videos.length}`;
            previous.disabled = this.busy || index === 0;
            next.disabled = this.busy || index === videos.length - 1;
        };
        const move = step => {
            const index = videos.findIndex(row => row.index === Number(select.value)) + step;
            if (this.busy || !videos[index]) return;
            select.value = videos[index].index;
            select.onchange();
        };
        previous.onclick = () => move(-1);
        next.onclick = () => move(1);
        const originalSelect = dialog.querySelector('[data-source]');
        const placeholder = document.createElement('option');
        placeholder.value = ''; placeholder.textContent = T('trim_video_choose_original'); placeholder.disabled = true;
        originalSelect.append(placeholder);
        const video = dialog.querySelector('video');
        const range = dialog.querySelector('cap-export-range');
        const status = dialog.querySelector('cap-status-message');
        const save = dialog.querySelector('[data-save]');
        const resize = dialog.querySelector('[data-resize]');
        const cancel = dialog.querySelector('[data-cancel]');
        const insert = dialog.querySelector('[data-insert]');
        const shots = dialog.querySelector('cap-shot-control');
        const shotDrafts = new Map();
        const changedShots = new Set();
        shots.onchange = () => changedShots.add(Number(select.value));
        this._saveShotDrafts = () => {
            if (!changedShots.size || app._destroyed || app._findClipById(clip.id) !== clip || clip.track.locked) return;
            const currentItems = app._clipItems(app._ensureClipMeta(clip));
            const changed = [...changedShots].filter(index => currentItems[index]?.id === items[index].id
                && app._findMediaById(items[index].id));
            if (!changed.length) return;
            app._recordUndo();
            for (const index of changed) {
                app._findMediaById(items[index].id).video_shots = structuredClone(shotDrafts.get(index));
            }
            changedShots.clear();
            app._saveToWidgets();
        };
        for (const {item, index} of videos) {
            const saved = app._findMediaById(item.id)?.video_shots;
            if (saved) shotDrafts.set(index, structuredClone(saved));
        }
        const fps = app.getFps();
        let source;
        let sourceChanged = false;
        const drafts = new Map();
        const configureShots = () => {
            const index = Number(select.value);
            let draft = shotDrafts.get(index);
            if (!draft || draft.source_id !== source?.item.id) {
                draft = {source_id: source?.item.id, points: []};
                shotDrafts.set(index, draft);
            }
            shots.configure(draft.points, fps, range.startFrame, range.endFrame, {
                title: T('shot_control'), cursor: T('compose_range_current'), add: T('shot_add'), remove: T('shot_delete'),
                description: T('shot_description'), hint: T('shot_hint'),
            });
        };
        const rememberRange = () => {
            if (!source || !range.totalFrames || save.disabled) return;
            source = {...source, start: range.startFrame / fps, duration: (range.endFrame - range.startFrame) / fps};
            drafts.set(Number(select.value), source);
        };
        for (const item of app._projectResources.filter(item => item.kind === 'video')) {
            const option = document.createElement('option');
            option.value = item.id; option.textContent = item.file.split(/[\\/]/).pop();
            option.title = item.file; originalSelect.append(option);
        }
        for (const {item, index} of videos) {
            const option = document.createElement('option');
            option.value = index; option.textContent = item.file.split(/[\\/]/).pop(); select.append(option);
        }
        const selected = app._clipPreviewItemIndex(clip, app._ensureClipMeta(clip));
        select.value = videos.some(row => row.index === selected) ? selected : videos[0].index;
        const sync = () => {
            if (range.totalFrames && video.currentTime >= range.endFrame / fps) {
                video.pause(); video.currentTime = videoFrameSeekTime(range.startFrame, fps);
            }
            range.update(video.currentTime * fps || 0, !video.paused);
            shots.update(video.currentTime * fps || 0);
            dialog.querySelector('.cat-te-video-trim-summary').textContent = T('trim_video_summary', {
                total: formatTimecode(range.totalFrames * 1000 / Math.ceil(fps), Math.ceil(fps)),
            });
        };
        video.onloadedmetadata = () => {
            if (!source || !Number.isFinite(video.duration) || video.duration <= 0) return;
            range.configure(Math.round(video.duration * fps), fps, {
                start: T('compose_range_start'), end: T('compose_range_end'), current: T('compose_range_current'),
                advance: T('trim_range_advance'), lock: T('trim_range_lock'), match: T('trim_range_match'), selected: T('trim_range_selected'),
                play: T('compose_range_play'), pause: T('compose_range_pause'), hint: T('trim_reference_video_hint'),
            });
            range.startFrame = Math.max(0, Math.min(range.totalFrames - 1, Math.round(source.start * fps)));
            range.endFrame = source.duration == null ? range.totalFrames
                : Math.max(range.startFrame + 1, Math.min(range.totalFrames, Math.round((source.start + source.duration) * fps)));
            video.currentTime = videoFrameSeekTime(range.startFrame, fps);
            video.playbackRate = source.rate;
            configureShots();
            insert.disabled = false;
            sync();
            save.disabled = resize.disabled = !range.totalFrames;
            if (sourceChanged || drafts.has(Number(select.value))) rememberRange();
        };
        video.ontimeupdate = video.onplay = video.onpause = video.onseeked = sync;
        video.onerror = () => { save.disabled = resize.disabled = insert.disabled = true; status.setStatus(T('asset_missing_cannot_preview'), 'error'); };
        range.addEventListener('toggleplay', () => {
            if (!range.totalFrames) return;
            if (!video.paused) { video.pause(); return; }
            if (video.currentTime < range.startFrame / fps || video.currentTime >= range.endFrame / fps) video.currentTime = videoFrameSeekTime(range.startFrame, fps);
            void video.play().catch(error => status.setStatus(error.message, 'error'));
        });
        const seek = event => { video.currentTime = videoFrameSeekTime(event.detail.frame, fps); sync(); };
        range.addEventListener('seek', seek);
        shots.addEventListener('seek', event => { video.pause(); seek(event); });
        range.addEventListener('matchrange', () => {
            if (source) range.setRangeLength(clip.duration * source.rate * fps);
        });
        range.addEventListener('rangechange', event => { video.pause(); rememberRange(); configureShots(); seek(event); });
        select.onchange = () => {
            video.pause(); save.disabled = resize.disabled = insert.disabled = true;
            status.setStatus('');
            source = null;
            sourceChanged = false;
            updateNavigation();
            try {
                const item = items[Number(select.value)];
                const draft = drafts.get(Number(select.value));
                const missingOrigin = !draft && !app._findMediaById(item.id)?.video_trim && /_trim_[a-f0-9]{8}\.mp4$/i.test(item.file);
                shots.hidden = range.hidden = dialog.querySelector('.cat-te-video-trim-summary').hidden = missingOrigin;
                if (missingOrigin) {
                    source = null; originalSelect.value = '';
                    video.removeAttribute('src'); video.load();
                    status.setStatus(T('trim_video_no_origin'), 'info');
                    return;
                }
                source = draft || videoTrimSource(app, item);
                originalSelect.value = source.item.id;
                video.src = app._videoUrl(source.item.file);
            } catch (error) {
                video.removeAttribute('src'); video.load();
                status.setStatus(error.message, 'error');
            }
        };
        originalSelect.onchange = () => {
            const item = app._findMediaById(originalSelect.value);
            if (!item) return;
            video.pause(); save.disabled = resize.disabled = insert.disabled = true; status.setStatus('');
            shots.hidden = range.hidden = dialog.querySelector('.cat-te-video-trim-summary').hidden = false;
            source = { item, start: 0, duration: null, rate: 1 };
            sourceChanged = true;
            video.src = app._videoUrl(item.file);
        };
        select.onchange();
        cancel.onclick = () => dialog.close();
        const apply = async (insertPrompt = false, resizeClip = false) => {
            if (this.busy || save.disabled) return;
            const currentShots = shots.points.filter(point => point.time * fps >= range.startFrame - 1e-6 && point.time * fps < range.endFrame - 1e-6);
            const prompt = insertPrompt ? shotPrompt(currentShots) : '';
            if (insertPrompt && !prompt) { status.setStatus(T('shot_empty'), 'warning'); return; }
            const duration = (range.endFrame - range.startFrame) / fps / source.rate;
            const edits = [...drafts];
            this.busy = dialog.closeDisabled = save.disabled = resize.disabled = insert.disabled = cancel.disabled = select.disabled = originalSelect.disabled = true;
            updateNavigation();
            shots.inert = range.inert = true;
            video.pause(); status.setStatus(T('composing_please_wait'));
            try {
                const results = [];
                for (const [index, draft] of edits) {
                    const result = await cutVideo(app, draft.item, draft.start, draft.duration, draft.rate);
                    results.push({index, result});
                }
                if (app._destroyed || app._findClipById(clip.id) !== clip || clip.track.locked
                    || [...new Set([...drafts.keys(), ...shotDrafts.keys()])].some(index => app._clipItems(app._ensureClipMeta(clip))[index]?.file !== items[index].file)) throw new Error(T('local_audio_target_changed'));
                app._recordUndo();
                for (const {index, result} of results) app._replaceDirectorVideo(clip, index, result.file, result.trim);
                if (resizeClip) {
                    clip.duration = duration;
                    app._rememberResourceTiming(clip);
                    app._ensureTimelineLength(clip.endTime);
                    clip._applyPosition();
                    app._decorateClip(clip);
                    app._refreshTimelineDuration();
                    if (app._selClip === clip) app._updateClipInfoPanel(clip);
                }
                const updatedItems = app._clipItems(app._ensureClipMeta(clip));
                for (const [index, draft] of shotDrafts) {
                    const media = app._findMediaById(updatedItems[index]?.id);
                    if (media) media.video_shots = structuredClone(draft);
                }
                if (prompt) {
                    const meta = app._ensureClipMeta(clip);
                    meta.prompt = [String(meta.prompt || '').trimEnd(), prompt].filter(Boolean).join('\n\n');
                    app._refreshFinalPromptDisplay();
                    if (app._selClip === clip) app._updateClipInfoPanel(clip);
                }
                app._saveToWidgets(); app._scheduleProgramPreview();
                changedShots.clear();
                dialog.closeDisabled = false; dialog.close();
                if (prompt) void app._openAiOptimizeModal(clip);
            } catch (error) { status.setStatus(error.message, 'error'); }
            finally { this.busy = dialog.closeDisabled = save.disabled = resize.disabled = insert.disabled = cancel.disabled = select.disabled = originalSelect.disabled = false; shots.inert = range.inert = false; updateNavigation(); }
        };
        save.onclick = () => apply();
        resize.onclick = () => apply(false, true);
        insert.onclick = () => apply(true);
        dialog.showModal();
    }
}
