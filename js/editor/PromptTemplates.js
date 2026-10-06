export const TEMPLATE_STORAGE_KEY = 'capricorncd.timeline.prompt_templates.v1';

const examples = [
    ['multi_image', 'H3 多图参考', '使用参考图定义人物、场景和道具，按实际上传顺序填写 <Picture N>。',
        'subject_definitions:\n<Subject 1>: <Picture 1> 中的人物，保持面容、发型和服装一致。\n<Subject 2>: <Picture 2> 中的场景，保持空间结构和光线一致。\n\nsummary: <Subject 1> 在 <Subject 2> 中完成指定动作。\n\ndetailed_description: [Shot 1] 描述动作、景别、运镜和镜头衔接。\n\noverall_soundscape: 描述环境声和动作声音。'],
    ['video', 'H3 视频参考', '视频只作为动作或镜头参考时，明确保留什么、替换什么。',
        'subject_definitions:\n<Subject 1>: <Picture 1> 中的人物，保持人物一致。\n<Video 1>: 动作与节奏参考视频。\n\nsummary: 由 <Subject 1> 完成 <Video 1> 中的动作。\n\ndetailed_description: 参考 <Video 1> 的动作轨迹、时序和身体协调；人物外观、服装和场景按图片参考替换，不沿用参考视频人物。\n\noverall_soundscape: 描述声音。'],
    ['avatar', 'H3 数字人', '用图片定义人物，用音频驱动口型与表演。',
        'subject_definitions:\n<Subject 1>: <Picture 1> 中的人物，保持面容、发型和服装一致。\n<Audio 1>: 演唱或对白音频。\n\nsummary: <Subject 1> 面向镜头完成数字人表演。\n\ndetailed_description: 口型与 <Audio 1> 同步，表情随语气变化，视线自然，身体动作克制；描述构图、光线和背景。\n\noverall_soundscape: 使用 <Audio 1>，不添加额外对白。'],
    ['audio', 'H3 音频驱动表演', '让表演动作、镜头节奏与音频重音对应。',
        'subject_definitions:\n<Subject 1>: <Picture 1> 中的人物。\n<Audio 1>: 表演节奏和情绪参考。\n\nsummary: <Subject 1> 随 <Audio 1> 完成表演。\n\ndetailed_description: 描述起始姿态、重音上的动作、情绪转折和收尾姿态；镜头变化与音频节奏同步，保持人物一致。\n\noverall_soundscape: 使用 <Audio 1>。'],
    ['first_last', 'H3 首尾帧', '按实际首尾帧输入配置填写，不额外假定图片编号。',
        'summary: 从首帧自然过渡到尾帧。\n\ndetailed_description: 保持首帧人物、场景和构图作为起点；描述中间动作与运镜，逐步到达尾帧的姿态、位置和构图。保持身份、服装及空间连续，避免突然跳变。\n\noverall_soundscape: 描述声音。'],
    ['first', 'H3 首帧参考', '以已设置的首帧为镜头起点。',
        'summary: 描述从首帧开始发生的事件。\n\ndetailed_description: 严格从首帧的姿态、构图、场景和光线开始，保持人物一致；描述后续动作、运镜及结束画面。\n\noverall_soundscape: 描述声音。'],
    ['last', 'H3 尾帧参考', '描述如何到达已设置的尾帧。',
        'summary: 描述最终到达尾帧的事件。\n\ndetailed_description: 描述开始画面、中间动作和镜头运动，最终到达尾帧的姿态、位置、构图与光线，保持人物和空间连续。\n\noverall_soundscape: 描述声音。'],
    ['text_image', 'H3 文生图', '纯文本画面描述，不需要参考素材编号。',
        '主体：描述人物或物体的外观、服装、姿态和表情。\n场景：描述地点、背景与道具。\n构图：描述景别、角度、主体位置和画幅。\n光线与色彩：描述光源、明暗和色调。\n风格与细节：描述视觉风格、材质与细节。'],
];

export function defaultPromptTemplates() {
    return {schema_version: 1, items: examples.map(([id, name, note, text]) => ({id: `h3_${id}`, name, text: `// ${note}\n${text}`, stars: 0}))};
}

export function sortPromptTemplates(items) {
    return [...items].sort((a, b) => b.stars - a.stars);
}

export function validatePromptTemplates(data) {
    if (!data || data.schema_version !== 1 || !Array.isArray(data.items)
        || data.items.some(row => !row || typeof row.name !== 'string' || !row.name.trim() || typeof row.text !== 'string')) {
        throw new Error('Invalid prompt template document');
    }
    const ids = new Set();
    return {schema_version: 1, items: data.items.map(row => {
        const id = typeof row.id === 'string' && row.id && !ids.has(row.id) ? row.id : crypto.randomUUID();
        ids.add(id);
        return {id, name: row.name.trim(), text: row.text, stars: Math.max(0, Math.min(5, Math.round(Number(row.stars) || 0)))};
    })};
}

export function readPromptTemplates(storage = localStorage) {
    const saved = storage.getItem(TEMPLATE_STORAGE_KEY);
    return saved == null ? defaultPromptTemplates() : validatePromptTemplates(JSON.parse(saved));
}

export function writePromptTemplates(data, storage = localStorage) {
    const next = validatePromptTemplates(data);
    storage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next));
    return next;
}

export function mergePromptTemplates(current, imported) {
    const next = validatePromptTemplates(imported);
    const items = current.items.map(row => ({...row}));
    for (const row of next.items) {
        const index = items.findIndex(item => item.id === row.id);
        if (index >= 0) items[index] = row;
        else if (!items.some(item => item.name === row.name && item.text === row.text)) items.push(row);
    }
    return {schema_version: 1, items};
}
