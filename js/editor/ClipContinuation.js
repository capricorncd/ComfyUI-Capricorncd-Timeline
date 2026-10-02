// Continuation requires saving the previous latent in addition to manual saves.
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
    return tracks.map(track => ({ ...track, clips: (track.clips || []).map(clip => ({
        ...clip, reference_previous: clip.reference_previous === true,
    })) }));
}
