// Saving context is a dependency of the following clip, not a separate UI option.
export function applyContinuationSettings(tracks) {
    for (const track of tracks) {
        if (track.type !== 'director' || track.enabled === false || track.visible === false) continue;
        const clips = [...(track.clips || [])].filter(c => c.enabled !== false && c.visible !== false)
            .sort((a, b) => a.start_ms - b.start_ms);
        for (let i = 0; i < clips.length; i++) {
            const next = clips[i], previous = clips[i - 1];
            if (!next.reference_previous || !previous
                || (next.agent || 'MiniMaxH3') !== 'MiniMaxH3'
                || (previous.agent || 'MiniMaxH3') !== 'MiniMaxH3') continue;
            if (Math.abs(previous.start_ms + previous.duration_ms - next.start_ms) <= 1) previous.save_latent = true;
        }
    }
}

export function migrateContinuationSettings(tracks) {
    return tracks.map(track => {
        const ordered = [...(track.clips || [])].sort((a, b) => a.start_ms - b.start_ms);
        const clips = ordered.map((clip, i) => {
            if (typeof clip.reference_previous === 'boolean') return clip;
            const previous = ordered[i - 1];
            const linked = previous?.save_latent && previous.enabled !== false && previous.visible !== false
                && (previous.agent || 'MiniMaxH3') === 'MiniMaxH3'
                && Math.abs(previous.start_ms + (previous.duration_ms ?? (previous.end_ms - previous.start_ms)) - clip.start_ms) <= 1;
            return { ...clip, reference_previous: (clip.agent || 'MiniMaxH3') === 'MiniMaxH3'
                && (Number(clip.h3_motion_context_length) > 0 || !!linked) };
        });
        const byId = new Map(clips.map(c => [c.id, c]));
        return { ...track, clips: (track.clips || []).map(c => byId.get(c.id)) };
    });
}
