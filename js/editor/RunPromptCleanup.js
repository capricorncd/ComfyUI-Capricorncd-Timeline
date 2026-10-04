import {stripPromptComments} from '../prompt_text.js';
import {renameAssetMentions} from '../prompt_asset_rename.js';

export function cleanRunPrompts(project, generation) {
    const result = structuredClone(project);
    const request = generation ? structuredClone(generation) : generation;
    const catalog = result.media || [];
    const names = catalog.map(row => row.name || String(row.file || '').split(/[\\/]/).pop());
    const cleanFields = (row, keys) => {
        for (const key of keys) if (typeof row?.[key] === 'string') row[key] = stripPromptComments(row[key]);
    };
    for (const track of result.tracks || []) for (const clip of track.clips || []) {
        const texts = [clip.prompt];
        for (const key of ['prepend_prompt', 'append_prompt']) {
            if (clip['use_' + key] !== false) texts.push(result.settings?.[key]);
        }
        for (const point of clip.keyframes?.points || []) texts.push(point.description);
        for (const media of catalog) if ((clip.media_ids || []).includes(media.id)) {
            for (const point of media.video_shots?.points || []) texts.push(point.description);
        }
        const raw = texts.filter(Boolean).join('\n');
        const clean = stripPromptComments(raw);
        clip.prompt_media_ids = (clip.prompt_media_ids || []).filter(id => {
            const index = catalog.findIndex(row => row.id === id);
            if (index < 0) return false;
            const name = names[index];
            const mentions = text => renameAssetMentions(text, name, name + '__run_reference', names) !== text;
            return !mentions(raw) || mentions(clean);
        });
        cleanFields(clip, ['prompt', 'style_prompt', 'speech_prompt']);
        for (const point of clip.keyframes?.points || []) cleanFields(point, ['description']);
        for (const skill of clip.prompt_skills || []) cleanFields(skill, ['text']);
    }
    cleanFields(result.settings, ['global_prompt', 'style_prompt', 'prepend_prompt', 'append_prompt', 'negative_prompt', 'non_diegetic_music']);
    for (const media of catalog) {
        cleanFields(media, ['prompt', 'setting_description']);
        for (const point of media.video_shots?.points || []) cleanFields(point, ['description']);
    }
    for (const run of request?.keyframe_runs || []) for (const interval of run.intervals || []) cleanFields(interval, ['prompt']);
    return {project: result, generation: request};
}
