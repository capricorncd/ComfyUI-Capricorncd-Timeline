export function mergeReferenceProject(current, reference, mediaIds, position) {
    const project = structuredClone(current);
    const tracks = structuredClone(reference.tracks || []);
    const end = rows => Math.max(0, ...rows.flatMap(track => (track.clips || []).map(clip =>
        Number(clip.start_ms || 0) + Math.max(0, Number(clip.duration_ms ?? (Number(clip.end_ms || 0) - Number(clip.start_ms || 0)))))));
    const referenceEnd = end(tracks);
    const offset = position === 'start' ? 0 : end(project.tracks || []);
    const clipIds = new Map(tracks.flatMap(track => (track.clips || []).map(clip => [clip.id, `clip_${crypto.randomUUID()}`])));
    const groups = new Map();
    const shift = (clip, amount) => {
        clip.start_ms = Number(clip.start_ms || 0) + amount;
        if (clip.end_ms != null) clip.end_ms += amount;
    };
    const remap = value => {
        if (Array.isArray(value)) return value.map(remap);
        if (!value || typeof value !== 'object') return value;
        for (const [key, item] of Object.entries(value)) {
            if (['media_ids', 'prompt_media_ids'].includes(key)) value[key] = item.map(id => mediaIds[id] || id);
            else if (['media_id', 'character_media_id', 'last_frame_media_id'].includes(key)) value[key] = mediaIds[item] || item;
            else if (['clip_id', 'source_clip_id', 'previous_source_clip_id', 'bound_clip_id'].includes(key)) value[key] = clipIds.get(item) || item;
            else value[key] = remap(item);
        }
        return value;
    };
    for (const track of tracks) {
        track.id = `track_${crypto.randomUUID()}`;
        for (const clip of track.clips || []) {
            remap(clip);
            clip.id = clipIds.get(clip.id);
            if (clip.group_id) {
                if (!groups.has(clip.group_id)) groups.set(clip.group_id, `group_${crypto.randomUUID()}`);
                clip.group_id = groups.get(clip.group_id);
            }
            shift(clip, offset);
        }
    }
    if (position === 'start') for (const track of project.tracks || []) {
        for (const clip of track.clips || []) shift(clip, referenceEnd);
    }
    project.tracks = [...(project.tracks || []), ...tracks];
    project.media = [...(project.media || []), ...(reference.media || [])];
    return project;
}
