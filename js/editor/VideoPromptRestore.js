export function videoPromptUpdates(generation) {
    const records = generation?.kind === 'composition' ? generation.clips || [] : [{ generation }];
    const updates = new Map();
    for (const item of records) {
        const record = item.generation;
        const segment = record?.keyframe_segment;
        const id = segment?.clip_id || item.timeline_clip_id || record?.clip_id;
        if (!id) continue;
        const prompts = record?.prompts || [];
        const generated = prompts.filter(row => row.id === 'h3_clip_prompt' && row.name === 'prompt');
        const candidates = generated.length ? generated : prompts.filter(row => ['prompt', 'text', 'positive'].includes(row.name));
        const texts = [...new Set(candidates.map(row => row.text).filter(text => typeof text === 'string' && text.trim()))];
        if (texts.length !== 1) continue;
        const key = JSON.stringify([String(id), segment ? (segment.interval_start_frame ?? segment.start_frame) / segment.fps : null]);
        if (updates.has(key) && updates.get(key)?.text !== texts[0]) updates.set(key, null);
        else if (!updates.has(key)) updates.set(key, {id: String(id), text: texts[0], ...(segment ? {segment} : {})});
    }
    return [...updates.values()].filter(Boolean);
}
