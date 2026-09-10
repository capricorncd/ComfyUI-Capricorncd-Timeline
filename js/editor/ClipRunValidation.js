const start = clip => Number(clip.start_ms || 0);
const duration = clip => Number(clip.duration_ms ?? (clip.end_ms - start(clip)));
const active = clip => clip.enabled !== false && clip.visible !== false
    && !['audio', 'subtitle', 'text', 'voiceover'].includes(clip.type)
    && (String(clip.prompt || '').split('\n').some(line => line.trim() && !line.trimStart().startsWith('#'))
        || (clip.media_ids || []).some((id, i) => id && clip.media_enabled?.[i] !== false)
        || clip.start_image || clip.end_image || clip.source?.file);
const h3 = clip => (clip.agent || 'MiniMaxH3') === 'MiniMaxH3';
const linked = (prev, next) => active(prev) && active(next) && h3(prev) && h3(next)
    && prev.save_latent
    && Math.abs(start(prev) + duration(prev) - start(next)) <= 1;

export function relatedH3ClipIds(project, clipId) {
    for (const track of project.tracks || []) {
        if (track.enabled === false || track.visible === false
            || !['director', 'visual', 'image', 'video'].includes(track.type || 'visual')) continue;
        const clips = [...(track.clips || [])].sort((a, b) => start(a) - start(b));
        const index = clips.findIndex(c => String(c.id) === String(clipId));
        if (index < 0 || !active(clips[index])) continue;
        let first = index, last = index;
        while (first > 0 && linked(clips[first - 1], clips[first])) first--;
        while (last + 1 < clips.length && linked(clips[last], clips[last + 1])) last++;
        return clips.slice(first, last + 1).map(c => String(c.id));
    }
    return [];
}

// H3 frame padding is handled by source spans, never by moving storyboard boundaries.
export function planClipRunLayout(project, clipIds = null) {
    return { changes: [] };
}

export function clipLayoutList(changes) {
    const time = ms => (ms / 1000).toFixed(3);
    return changes.map(c => `${c.name} [${c.id}]: ${time(c.oldStart)}–${time(c.oldEnd)} s → ${time(c.start)}–${time(c.end)} s`).join('\n');
}
