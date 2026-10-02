export function videoPromptUpdates(generation) {
    const records = generation?.kind === 'composition' ? generation.clips || [] : [{ generation }];
    const updates = new Map();
    for (const item of records) {
        const record = item.generation;
        const id = item.timeline_clip_id || record?.clip_id;
        if (!id) continue;
        const prompts = record?.prompts || [];
        const generated = prompts.filter(row => row.id === 'h3_clip_prompt' && row.name === 'prompt');
        const candidates = generated.length ? generated : prompts.filter(row => ['prompt', 'text', 'positive'].includes(row.name));
        const texts = [...new Set(candidates.map(row => row.text).filter(text => typeof text === 'string' && text.trim()))];
        if (texts.length !== 1) continue;
        const key = String(id);
        if (updates.has(key) && updates.get(key) !== texts[0]) updates.set(key, null);
        else if (!updates.has(key)) updates.set(key, texts[0]);
    }
    return [...updates].filter(([, text]) => text !== null).map(([id, text]) => ({ id, text }));
}
