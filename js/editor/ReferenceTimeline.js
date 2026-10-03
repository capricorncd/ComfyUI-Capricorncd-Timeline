import {t as T} from '../i18n/timeline_editor.js';

export function referenceTimeline(app, clip) {
    const meta = app._ensureClipMeta(clip);
    if (meta.referenceTimeline) {
        const timeline = structuredClone(meta.referenceTimeline);
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
        app.genEditModal.querySelector('.cat-te-gen-edit-actions').prepend(tools);
    }
    tools.replaceChildren();
    tools.hidden = !st.reference;
    if (!st.reference) return;
    const select = document.createElement('cap-select');
    const assets = app._projectResources.filter(row => ['video', 'audio'].includes(row.kind));
    select.setOptions(assets.map(row => ({value: row.id, label: row.name || row.file})), T('reference_asset'));
    const add = document.createElement('cap-button');
    add.textContent = T('add_btn');
    add.disabled = !assets.length;
    add.addEventListener('click', async () => {
        const media = app._findMediaById(select.value);
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
    });
    const label = document.createElement('label');
    const control = document.createElement('cap-switch');
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
    checkbox.checked = st.perTrack;
    checkbox.addEventListener('change', () => {
        if (app._genEditState !== st || st.merging) return;
        st.perTrack = checkbox.checked; app._applyGenEditChanges();
    });
    control.append(checkbox); label.append(control, document.createTextNode(T('reference_per_track')));
    tools.append(select, add, label);
}
