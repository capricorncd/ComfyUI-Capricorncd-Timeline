import {renameAssetMentions} from '../prompt_asset_rename.js';
import {stripPromptComments} from '../prompt_text.js';

export function selectedClipProject(source, clipIds, name) {
    const project = structuredClone(source);
    const selected = new Set(clipIds);
    const audioTracks = project.tracks.filter(track => ['audio', 'voiceover'].includes(track.type));
    project.tracks = project.tracks.map(track => ({...track,
        clips: track.clips.filter(clip => selected.has(clip.id)),
    })).filter(track => track.clips.length);
    const clips = project.tracks.flatMap(track => track.clips);
    if (!clips.length) return null;
    const ranges = [];
    const fps = Number(project.settings?.fps) || 24;
    for (const track of project.tracks) {
        if (track.type !== 'director') continue;
        for (const clip of track.clips) {
            const start = clip.start_ms, end = start + clip.duration_ms;
            if (clip.use_audio_track_audio === true) { ranges.push([start, end]); continue; }
            const media = (project.media || []).find(row => row.kind === 'video' &&
                (clip.media_ids || []).some((id, index) => id === row.id && clip.media_enabled?.[index] !== false) &&
                row.video_shots?.source_id === (row.video_trim?.source_id || row.id));
            const shots = clip.keyframes || (clip.clip_role === 'video_ref' && !clip.reference_timeline ? media?.video_shots : null);
            const points = shots?.points || [];
            const trim = media?.video_trim;
            const localShots = shots?.source_id === clip.id;
            const windowStart = localShots ? 0
                : Number(trim?.start || 0) + Number(clip.source?.in_ms || 0) / 1000 * Number(trim?.rate || 1);
            const rate = localShots ? 1 : Number(clip.playback_rate || 1) * Number(trim?.rate || 1);
            const frames = Math.round(clip.duration_ms / 1000 * fps);
            const starts = new Map([[0, null]]);
            for (const point of points) {
                const frame = Math.round((point.time - windowStart) / rate * fps);
                if (frame >= 0 && frame < frames) starts.set(frame, point);
            }
            const ordered = [...starts.keys()].sort((a, b) => a - b);
            for (const [index, frame] of ordered.entries()) {
                if (starts.get(frame)?.generation?.useAudioTrackAudio !== true) continue;
                ranges.push([start + Math.round(frame * 1000 / fps),
                    Math.min(end, start + Math.round((ordered[index + 1] ?? frames) * 1000 / fps))]);
            }
        }
    }
    for (const track of audioTracks) {
        if (track.enabled === false || track.muted === true) continue;
        const selectedAudio = project.tracks.find(row => row.id === track.id);
        const copied = [];
        for (const audio of track.clips) {
            if (selected.has(audio.id) || audio.enabled === false || audio.muted === true) continue;
            const audioEnd = audio.start_ms + audio.duration_ms;
            if (ranges.some(([start, end]) => audio.start_ms < end && audioEnd > start)) copied.push(audio);
        }
        if (copied.length) {
            if (selectedAudio) selectedAudio.clips.push(...copied);
            else project.tracks.push({...track, clips: copied});
        }
    }
    const offset = Math.min(...project.tracks.flatMap(track => track.clips.map(clip => clip.start_ms)));
    for (const clip of project.tracks.flatMap(track => track.clips)) clip.start_ms -= offset;
    project.tracks.forEach((track, index) => {track.order = index;});
    const ids = new Set(), files = new Set();
    const normalizeFile = file => String(file).replace(/\\/g, '/');
    const collect = (value, texts) => {
        if (!value || typeof value !== 'object') return;
        for (const [key, item] of Object.entries(value)) {
            if (key === 'file' && typeof item === 'string') files.add(normalizeFile(item));
            else if (key.endsWith('_id') && typeof item === 'string') ids.add(item);
            else if (key.endsWith('_ids') && Array.isArray(item)) item.forEach(id => ids.add(String(id)));
            if (texts && typeof item === 'string' && (key.includes('prompt') || key.includes('description') || key === 'text')) texts.push(stripPromptComments(item));
            if (item && typeof item === 'object') collect(item, texts);
        }
    };
    const media = project.media || [];
    const settingsTexts = Object.values(project.settings || {}).filter(value => typeof value === 'string').map(stripPromptComments);
    collect(project.settings, settingsTexts);
    const names = media.map(row => row.name || String(row.file || '').split(/[\\/]/).pop());
    const mentionedMedia = texts => media.filter((row, index) => {
        const name = names[index];
        return name && texts.some(text => renameAssetMentions(text, name, `${name}__selected`, names) !== text);
    });
    for (const clip of project.tracks.flatMap(track => track.clips)) {
        const texts = [...settingsTexts];
        collect(clip, texts);
        for (const row of mentionedMedia(texts)) {
            ids.add(row.id);
            clip.prompt_media_ids = [...new Set([...(clip.prompt_media_ids || []), row.id])];
        }
    }
    const included = new Set();
    let changed;
    do {
        changed = false;
        for (const row of media) {
            if (included.has(row.id) || (!ids.has(row.id) && !files.has(normalizeFile(row.file)))) continue;
            included.add(row.id);
            const texts = [];
            collect(row, texts);
            for (const reference of mentionedMedia(texts)) ids.add(reference.id);
            changed = true;
        }
    } while (changed);
    project.media = (project.media || []).filter(media => included.has(media.id));
    project.name = name;
    delete project.project_directory;
    project.composed_videos = [];
    project.settings.current_time = 0;
    project.settings.timeline_scroll_left = 0;
    project.settings.timeline_scroll_top = 0;
    return project;
}
