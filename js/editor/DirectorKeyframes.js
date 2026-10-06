import { api } from '../../../scripts/api.js';
import '../components/StatusMessage.js';
import { t as T } from '../i18n/timeline_editor.js';
import { shotPrompt } from '../components/ShotControl.js';
import { videoTrimSource } from './VideoTrim.js';

export function shotWindow(clip, source) {
    const rate = (clip.playbackRate || 1) * source.rate;
    return {start: source.start + (clip.sourceOffset || 0) * source.rate, rate, duration: clip.duration * rate};
}

export class DirectorKeyframes {
    constructor(app, panel, isDirector) {
        this.app = app;
        this.panel = panel;
        this.isDirector = isDirector;
        this.selection = null;
        panel.setMentionSource(() => app._promptMentionAssets());
        panel.bindPromptHistory(() => app._promptHistoryDocument(), data => app._savePromptHistory(data));
        panel.addEventListener('asset-mention', event => app._linkPromptMention(this.selectedTarget()?.clip, event.detail));
        panel.addEventListener('asset-mention-remove', event => {
            const clip = this.selectedTarget()?.clip;
            queueMicrotask(() => app._unlinkPromptMention(clip, event.detail));
        });
        this.editing = false;
        this.detecting = new Set();
        this.status = document.createElement('cap-status-message');
        this.status.hidden = true;
        panel.after(this.status);
        panel.addEventListener('delete', () => this.remove());
        panel.addEventListener('insert', () => this.insertPrompt());
        panel.addEventListener('prompt-commit', () => { this.editing = false; });
        panel.addEventListener('prompt-change', event => {
            const target = this.selectedTarget();
            if (!target || target.clip.track.locked) return;
            if (!this.editing) { app._recordUndo(); this.editing = true; }
            this.selection.point.description = event.detail;
            this.save(target, false);
        });
    }
    target(clip) {
        if (!clip || ['audio', 'voiceover', 'filter'].includes(clip.track.type)) return null;
        const meta = this.app._ensureClipMeta(clip);
        const local = () => ({clip, media: meta, source: {item: {id: clip.id}, rate: 1},
            start: 0, rate: 1, duration: clip.duration, local: true});
        if (!this.isDirector(clip.track.type) || meta.clipRole !== 'video_ref' || meta.referenceTimeline) return local();
        const items = this.app._clipItems(meta);
        const current = items[this.app._clipPreviewItemIndex(clip, meta)];
        const item = current?.kind === 'video' && current.enabled !== false ? current
            : items.find(row => row.kind === 'video' && row.enabled !== false);
        if (!item) return local();
        const media = this.app._findMediaById(item.id);
        if (!media) return local();
        let source;
        try { source = videoTrimSource(this.app, item); } catch { return local(); }
        const window = shotWindow(clip, source);
        return {clip, media, source, ...window};
    }
    points(target) {
        const saved = target.media.video_shots;
        return saved && (target.local || saved.source_id === target.source.item.id) ? saved.points : [];
    }
    sync(clip) {
        const target = this.target(clip);
        let markers = clip?.el?.querySelector('cap-shot-markers');
        if (!target) { markers?.remove(); return; }
        if (!target.media.video_shots) {
            target.media.video_shots = {source_id: target.source.item.id, points: target.local ? [] : [{time: target.start, description: ''}]};
        }
        if (!markers) {
            markers = document.createElement('cap-shot-markers');
            markers.addEventListener('point-select', event => {
                const current = this.target(clip);
                if (current) this.select(current, this.points(current)[event.detail]);
            });
            clip.el.append(markers);
        }
        markers.configure(this.points(target), target.start, target.duration,
            this.selection?.clipId === clip.id ? this.selection.point : null, T('shot_control'));
    }
    timelinePointer(event) {
        if (event.button === 0 && this.selection
            && !event.composedPath().some(element => element.localName === 'cap-shot-markers')) this.clearSelection();
    }
    selectedTarget() {
        const selection = this.selection;
        if (!selection) return null;
        const clip = this.app._findClipById(selection.clipId);
        const target = this.target(clip);
        if (!clip?.selected || !target || (target.media.id || clip.id) !== selection.mediaId || !this.points(target).includes(selection.point)) return null;
        if (selection.point.time < target.start - 1e-7 || selection.point.time >= target.start + target.duration - 1e-7) return null;
        return target;
    }
    refreshPanel() {
        const target = this.selectedTarget();
        if (!target) { this.selection = null; this.panel.hidden = true; this.editing = false; return; }
        this.panel.configure(this.selection.point, (this.selection.point.time - target.start) / target.rate,
            this.app.getFps(), target.clip.track.locked, {
                title: T('shot_control'), description: T('shot_description'), hint: T('shot_hint'),
                delete: T('shot_delete'), insert: T('shot_insert'),
        });
        this.app._refreshKeyframeDrafts?.();
    }
    clearSelection() {
        const clip = this.selection && this.app._findClipById(this.selection.clipId);
        this.selection = null;
        this.editing = false;
        this.panel.hidden = true;
        if (clip) this.sync(clip);
    }
    select(target, point) {
        if (!point || target.clip.track.locked) return;
        this.app._timeline.selectClip(target.clip);
        this.selection = {clipId: target.clip.id, mediaId: target.media.id || target.clip.id, point};
        this.editing = false;
        this.app._timeline.setCurrentTime(target.clip.startTime + (point.time - target.start) / target.rate);
        this.sync(target.clip); this.refreshPanel();
    }
    add(clip, timelineTime) {
        const target = this.target(clip);
        if (!target || clip.track.locked) return;
        if (timelineTime >= clip.startTime + clip.duration - 1e-7) return;
        this.sync(clip);
        const fps = this.app.getFps();
        const frame = Math.max(0, Math.min(Math.ceil(clip.duration * fps - 1e-7) - 1, Math.round((timelineTime - clip.startTime) * fps)));
        const time = target.start + frame / fps * target.rate;
        const points = this.points(target);
        let point = points.find(row => Math.round((row.time - target.start) / target.rate * fps) === frame);
        if (!point) {
            this.app._recordUndo();
            point = {time, description: ''};
            if (target.media.video_shots.source_id !== target.source.item.id) {
                target.media.video_shots = {source_id: target.source.item.id, points: []};
            }
            if (frame > 0 && !target.media.video_shots.points.length) {
                target.media.video_shots.points.push({time: target.start, description: ''});
            }
            target.media.video_shots.points.push(point);
            target.media.video_shots.points.sort((a, b) => a.time - b.time);
            this.save(target);
        }
        this.select(target, point);
    }
    remove() {
        const target = this.selectedTarget();
        if (!target) return false;
        if (!target.clip.track.locked) {
            this.app._recordUndo();
            target.media.video_shots.points = this.points(target).filter(point => point !== this.selection.point);
            this.selection = null;
            this.save(target);
        }
        return true;
    }
    clear(clip) {
        const target = this.target(clip);
        if (!target || clip.track.locked || !this.points(target).length) return;
        this.app._recordUndo();
        target.media.video_shots = {source_id: target.source.item.id, points: []};
        this.clearSelection();
        this.save(target);
    }
    key(event) {
        if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === 'KeyP') {
            const clip = this.app._selClip;
            if (this.target(clip)) {
                event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
                this.add(clip, this.app._timeline.currentTime);
            }
            return;
        }
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const handled = ['Delete', 'Backspace'].includes(event.code) ? this.remove() : false;
        if (handled) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); }
    }
    save(target, updatePanel = true) {
        for (const track of this.app._timeline.tracks) for (const clip of track.clips) this.sync(clip);
        this.app._saveToWidgets();
        if (updatePanel) this.refreshPanel();
    }
    async detect(clip) {
        const target = this.target(clip);
        if (!target || target.local || clip.track.locked || this.detecting.has(clip.id)) return;
        this.sync(clip);
        this.detecting.add(clip.id);
        this.app._timeline.selectClip(clip);
        this.status.setStatus(T('shot_detecting'));
        try {
            const location = this.app._mediaStatus.get(`video:${target.source.item.file}`)?.location || target.source.item.location || 'input';
            const response = await api.fetchApi('/audio_keyframe_timeline/detect_video_scenes', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({file: target.source.item.file, location, start: target.start, duration: target.duration}),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            const current = this.target(this.app._findClipById(clip.id));
            if (this.app._destroyed || !current || current.clip.track.locked || current.media !== target.media
                || current.source.item.id !== target.source.item.id || current.start !== target.start
                || current.duration !== target.duration || current.rate !== target.rate) throw new Error(T('local_audio_target_changed'));
            const fps = this.app.getFps();
            const points = this.points(current);
            const occupied = new Set(points.map(point => Math.round((point.time - current.start) / current.rate * fps)));
            const added = [];
            for (const time of data.times) {
                const frame = Math.round((time - current.start) / current.rate * fps);
                if (frame < 0 || frame >= Math.ceil(clip.duration * fps - 1e-7) || occupied.has(frame)) continue;
                occupied.add(frame);
                added.push({time: current.start + frame / fps * current.rate, description: ''});
            }
            if (added.length) {
                this.app._recordUndo();
                current.media.video_shots = {source_id: current.source.item.id, points: [...points, ...added].sort((a, b) => a.time - b.time)};
                this.save(current);
            }
            this.status.setStatus(T('shot_detected', {count: added.length}), 'success');
        } catch (error) { this.status.setStatus(error.message, 'error'); }
        finally { this.detecting.delete(clip.id); }
    }
    insertPrompt() {
        const target = this.selectedTarget();
        if (!target || target.clip.track.locked) return;
        const points = this.points(target).filter(point => point.time >= target.start - 1e-7 && point.time < target.start + target.duration - 1e-7)
            .map(point => ({...point, time: (point.time - target.start) / target.rate}));
        const prompt = shotPrompt(points);
        if (!prompt) return;
        this.app._recordUndo();
        const meta = this.app._ensureClipMeta(target.clip);
        meta.prompt = [String(meta.prompt || '').trimEnd(), prompt].filter(Boolean).join('\n\n');
        this.app._refreshFinalPromptDisplay();
        this.app._updateClipInfoPanel(target.clip);
        this.app._saveToWidgets();
    }
}
