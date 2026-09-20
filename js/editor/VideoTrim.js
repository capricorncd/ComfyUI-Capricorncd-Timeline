import { api } from '../../../scripts/api.js';
import { t as T } from '../i18n/timeline_editor.js';
import '../components/Dialog.js';
import '../components/ExportRange.js';
import '../components/StatusMessage.js';

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
        this.dialog.addEventListener('close', () => this.stop());
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
            <label>${T('trim_video_clip_asset')}<select data-asset></select></label>
            <label>${T('trim_video_original')}<select data-source></select></label>
            <div class="cat-te-video-trim-stage"><video preload="metadata"></video></div>
            <div class="cat-te-video-trim-summary"></div>
            <cap-export-range></cap-export-range><cap-status-message></cap-status-message></div>
            <div slot="footer"><cap-button data-cancel>${T('cancel_btn')}</cap-button><cap-button data-save variant="primary">${T('apply_btn')}</cap-button></div>`;
        const select = dialog.querySelector('[data-asset]');
        select.parentElement.hidden = videos.length === 1;
        const originalSelect = dialog.querySelector('[data-source]');
        const placeholder = document.createElement('option');
        placeholder.value = ''; placeholder.textContent = T('trim_video_choose_original'); placeholder.disabled = true;
        originalSelect.append(placeholder);
        const video = dialog.querySelector('video');
        const range = dialog.querySelector('cap-export-range');
        const status = dialog.querySelector('cap-status-message');
        const save = dialog.querySelector('[data-save]');
        const cancel = dialog.querySelector('[data-cancel]');
        const fps = app.getFps();
        let source;
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
            dialog.querySelector('.cat-te-video-trim-summary').textContent = T('trim_video_summary', {
                total: (range.totalFrames / fps).toFixed(2), selected: ((range.endFrame - range.startFrame) / fps).toFixed(2),
            });
        };
        video.onloadedmetadata = () => {
            if (!source || !Number.isFinite(video.duration) || video.duration <= 0) return;
            range.configure(Math.round(video.duration * fps), fps, {
                start: T('compose_range_start'), end: T('compose_range_end'), current: T('compose_range_current'),
                play: T('compose_range_play'), pause: T('compose_range_pause'), hint: T('trim_reference_video_hint'),
            });
            range.startFrame = Math.max(0, Math.min(range.totalFrames - 1, Math.round(source.start * fps)));
            range.endFrame = source.duration == null ? range.totalFrames
                : Math.max(range.startFrame + 1, Math.min(range.totalFrames, Math.round((source.start + source.duration) * fps)));
            video.currentTime = videoFrameSeekTime(range.startFrame, fps);
            video.playbackRate = source.rate;
            sync();
            save.disabled = !range.totalFrames;
        };
        video.ontimeupdate = video.onplay = video.onpause = video.onseeked = sync;
        video.onerror = () => { save.disabled = true; status.setStatus(T('asset_missing_cannot_preview'), 'error'); };
        range.addEventListener('toggleplay', () => {
            if (!range.totalFrames) return;
            if (!video.paused) { video.pause(); return; }
            if (video.currentTime < range.startFrame / fps || video.currentTime >= range.endFrame / fps) video.currentTime = videoFrameSeekTime(range.startFrame, fps);
            void video.play().catch(error => status.setStatus(error.message, 'error'));
        });
        const seek = event => { video.currentTime = videoFrameSeekTime(event.detail.frame, fps); sync(); };
        range.addEventListener('seek', seek);
        range.addEventListener('rangechange', seek);
        select.onchange = () => {
            video.pause(); save.disabled = true;
            status.setStatus('');
            try {
                const item = items[Number(select.value)];
                const missingOrigin = !app._findMediaById(item.id)?.video_trim && /_trim_[a-f0-9]{8}\.mp4$/i.test(item.file);
                range.hidden = dialog.querySelector('.cat-te-video-trim-summary').hidden = missingOrigin;
                if (missingOrigin) {
                    source = null; originalSelect.value = '';
                    video.removeAttribute('src'); video.load();
                    status.setStatus(T('trim_video_no_origin'), 'info');
                    return;
                }
                source = videoTrimSource(app, item);
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
            video.pause(); save.disabled = true; status.setStatus('');
            range.hidden = dialog.querySelector('.cat-te-video-trim-summary').hidden = false;
            source = { item, start: 0, duration: null, rate: 1 };
            video.src = app._videoUrl(item.file);
        };
        select.onchange();
        cancel.onclick = () => dialog.close();
        save.onclick = async () => {
            const index = Number(select.value), item = items[index];
            this.busy = dialog.closeDisabled = save.disabled = cancel.disabled = select.disabled = originalSelect.disabled = true;
            video.pause(); status.setStatus(T('composing_please_wait'));
            try {
                const result = await cutVideo(app, source.item, range.startFrame / fps, (range.endFrame - range.startFrame) / fps, source.rate);
                if (app._destroyed || app._findClipById(clip.id) !== clip || clip.track.locked
                    || app._clipItems(app._ensureClipMeta(clip))[index]?.file !== item.file) throw new Error(T('local_audio_target_changed'));
                app._recordUndo();
                app._replaceDirectorVideo(clip, index, result.file, result.trim);
                app._saveToWidgets(); app._scheduleProgramPreview();
                dialog.closeDisabled = false; dialog.close();
            } catch (error) { status.setStatus(error.message, 'error'); }
            finally { this.busy = dialog.closeDisabled = save.disabled = cancel.disabled = select.disabled = originalSelect.disabled = false; }
        };
        dialog.showModal();
    }
}
