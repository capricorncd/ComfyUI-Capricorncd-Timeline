export function selectedClipProject(source, clipIds, name) {
    const project = structuredClone(source);
    const selected = new Set(clipIds);
    project.tracks = project.tracks.map(track => ({...track,
        clips: track.clips.filter(clip => selected.has(clip.id)),
    })).filter(track => track.clips.length);
    const clips = project.tracks.flatMap(track => track.clips);
    if (!clips.length) return null;
    const offset = Math.min(...clips.map(clip => clip.start_ms));
    for (const clip of clips) clip.start_ms -= offset;
    project.tracks.forEach((track, index) => {track.order = index;});
    const ids = new Set(), files = new Set();
    const normalizeFile = file => String(file).replace(/\\/g, '/');
    const collect = value => {
        if (!value || typeof value !== 'object') return;
        for (const [key, item] of Object.entries(value)) {
            if (key === 'file' && typeof item === 'string') files.add(normalizeFile(item));
            else if (key.endsWith('_id') && typeof item === 'string') ids.add(item);
            else if (key.endsWith('_ids') && Array.isArray(item)) item.forEach(id => ids.add(String(id)));
            if (item && typeof item === 'object') collect(item);
        }
    };
    clips.forEach(collect);
    const included = new Set();
    let changed;
    do {
        changed = false;
        for (const media of project.media || []) {
            if (included.has(media.id) || (!ids.has(media.id) && !files.has(normalizeFile(media.file)))) continue;
            included.add(media.id);
            collect(media);
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
