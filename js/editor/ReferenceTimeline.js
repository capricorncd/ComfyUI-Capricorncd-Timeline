import {t as T} from '../i18n/timeline_editor.js';
import '../components/ProjectVideoList.js';

export function referenceTimeline(app, clip) {
    const meta = app._ensureClipMeta(clip);
    if (meta.referenceTimeline) {
        const timeline = structuredClone(meta.referenceTimeline);
        const items = app._clipItems(meta).filter(item => ['video', 'audio'].includes(item.kind));
        const ids = new Set(items.map(item => item.id));
        for (const key of ['videos', 'audios']) {
            timeline[key] = timeline[key].filter(row => row.id !== `ref_${row.media_id}` || ids.has(row.media_id));
        }
        for (const item of items) {
            const rows = item.kind === 'video' ? timeline.videos : timeline.audios;
            if (rows.some(row => row.media_id === item.id)) continue;
            const row = {id: `ref_${item.id}`, media_id:item.id, file:item.file,
                enabled:item.enabled !== false, muted:false, volume:1, edit_start_sec:0};
            rows.push(item.kind === 'video'
                ? {...row, trim_in_sec:0, trim_out_sec:null, playback_rate:1}
                : {...row, track_id:row.id, duration:clip.duration, source_offset:0});
        }
        for (const row of [...timeline.videos, ...timeline.audios]) {
            const media = app._findMediaById(row.media_id);
            if (media) { row.file = media.file; row.location = media.location || 'input'; }
        }
        return timeline;
    }
    const videos = [], audios = [];
    for (const item of app._clipItems(meta)) {
        if (!['video', 'audio'].includes(item.kind)) continue;
        const media = app._findMediaById(item.id);
        const row = {id: `ref_${item.id}`, media_id: item.id, file: item.file,
            location: media?.location || 'input', enabled: item.enabled !== false,
            muted: false, volume: 1, edit_start_sec: 0};
        if (item.kind === 'video') videos.push({...row, trim_in_sec: 0, trim_out_sec: null, playback_rate: 1});
        else audios.push({...row, track_id: row.id, duration: clip.duration, source_offset: 0});
    }
    return {videos, audios, per_track: false};
}

export function sliceReferenceTimeline(timeline, start, duration) {
    const result = structuredClone(timeline);
    for (const kind of ['videos', 'audios']) {
        result[kind] = result[kind].flatMap(row => {
            const at = Number(row.edit_start_sec) || 0;
            const rate = kind === 'videos' ? Number(row.playback_rate) || 1 : 1;
            const offset = Number(kind === 'videos' ? row.trim_in_sec : row.source_offset) || 0;
            const length = kind === 'videos'
                ? ((row.trim_out_sec ?? row.duration_sec ?? (offset + (start + duration) * rate)) - offset) / rate
                : Number(row.duration) || duration;
            const begin = Math.max(start, at), end = Math.min(start + duration, at + length);
            if (end <= begin) return [];
            row.edit_start_sec = begin - start;
            if (kind === 'videos') {
                row.trim_in_sec = offset + (begin - at) * rate;
                row.trim_out_sec = row.trim_in_sec + (end - begin) * rate;
            } else {
                row.source_offset = offset + begin - at;
                row.duration = end - begin;
            }
            return [row];
        });
    }
    return result;
}

export function referenceTimelineControls(app) {
    const st = app._genEditState;
    let tools = app.genEditModal.querySelector('.cat-te-reference-timeline-tools');
    if (!tools) {
        tools = document.createElement('div');
        tools.className = 'cat-te-reference-timeline-tools';
        app.genEditModal.querySelector('.cat-te-gen-edit-right').append(tools);
    }
    tools.querySelector('cap-project-video-list')?.stop();
    tools.replaceChildren();
    tools.hidden = !st.reference;
    const existingReset = app.genEditModal.querySelector('.cat-te-reference-reset-duration');
    if (existingReset) existingReset.hidden = !st.reference;
    if (!st.reference) return;
    const assets = app._projectResources.filter(row => ['video', 'audio'].includes(row.kind));
    const addMedia = async media => {
        const clip = app._findClipById(st.clipId);
        if (!media || !clip || clip.track.locked || st.merging || app._genEditState !== st) return;
        const row = {id: `ref_${crypto.randomUUID()}`, media_id: media.id, file: media.file,
            location: media.location || 'input', edit_start_sec: st.timeline.currentTime,
            enabled: true, muted: false, volume: 1};
        if (media.kind === 'video') {
            row.trim_in_sec = 0; row.trim_out_sec = null; row.playback_rate = 1;
            await app._ensureGenVideoDuration(row);
            if (app._genEditState !== st || app._findClipById(st.clipId) !== clip || clip.track.locked) return;
            st.draft.unshift(row);
        } else {
            const buffer = await app._ensureGenVideoAudioBuffer(row.file, row.location);
            if (app._genEditState !== st || app._findClipById(st.clipId) !== clip || clip.track.locked) return;
            row.track_id = row.id; row.source_offset = 0;
            row.duration = buffer?.duration || clip.duration; row.source_duration = buffer?.duration;
            st.audioDraft.push(row);
        }
        app._applyGenEditChanges(); app._buildGenEditTimeline();
        app._syncGenEditInspector(); app._scheduleGenEditPreview();
    };
    const list = document.createElement('cap-project-video-list');
    list.setAttribute('compact', '');
    list.setVideos(assets, file => {
        const media = assets.find(row => row.file === file);
        return app._assetFileUrl(file, media.kind, media.location || 'input');
    }, (media, rect) => app._buildCtxMenu([{label:T('add_btn'),
        disabled: app._findClipById(st.clipId)?.track.locked || st.merging,
        fn:()=>void addMedia(media)}], rect.right, rect.bottom));
    const label = document.createElement('label');
    const control = document.createElement('cap-switch');
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
    checkbox.checked = st.perTrack;
    checkbox.addEventListener('change', () => {
        if (app._genEditState !== st || st.merging) return;
        st.perTrack = checkbox.checked; app._applyGenEditChanges();
    });
    control.append(checkbox); label.append(control, document.createTextNode(T('reference_per_track')));
    tools.append(label, list);
    let reset = app.genEditModal.querySelector('.cat-te-reference-reset-duration');
    if (!reset) {
        reset = document.createElement('cap-button');
        reset.className = 'cat-te-reference-reset-duration';
        app.genEditModal.querySelector('.cat-te-gen-edit-actions').append(reset);
    }
    reset.hidden = false;
    reset.textContent = T('reference_reset_clip_time');
    reset.disabled = app._findClipById(st.clipId)?.track.locked;
    reset.onclick = () => {
        const clip = app._findClipById(st.clipId);
        if (!clip || clip.track.locked || st.merging || app._genEditState !== st) return;
        app._pullGenEditDraftFromTimeline();
        const ends = [
            ...st.draft.filter(row=>row.enabled!==false).map(row=>(Number(row.edit_start_sec)||0)+(app._genEffectiveDurationSec(row)||0)),
            ...st.audioDraft.filter(row=>row.enabled!==false).map(row=>(Number(row.edit_start_sec)||0)+(Number(row.duration)||0)),
        ];
        const duration = Math.max(0, ...ends);
        if (!(duration > 0)) return;
        app._recordUndo();
        clip.duration = duration;
        app._rememberResourceTiming(clip);
        clip._applyPosition();
        app._ensureTimelineLength(clip.endTime);
        app._refreshTimelineDuration();
        app._saveToWidgets();
        app._syncSelectedClip();
        app._buildGenEditTimeline();
        app._scheduleGenEditPreview();
    };
}
