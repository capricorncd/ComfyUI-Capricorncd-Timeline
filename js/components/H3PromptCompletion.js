import { makeT, getLocale } from '../cap_i18n.js';
const T = makeT({
    "zh": {
        "Chinese": "中文", "English": "英语", "Japanese": "日语",
        "subject_definitions": "定义参考对象及固定编号；说明人物、物体、场景来自哪个素材。",
        "summary": "概述任务与参考关系，以 [任务类型] 开头；不要在此新增对象编号。",
        "retention_analysis": "逐行说明保留、修改、迁移或借鉴哪些参考特征。",
        "detailed_description": "参考模式正文：按镜头写画面、动作、运镜、对白与同步声音。",
        "integrated_multimodal_description": "文生／首尾帧模式正文；从 [Shot 1] 开始，不写首镜头时间戳。",
        "overall_soundscape": "全片环境声、动作声；对白留在镜头正文。N/A 仅用于完全静音。",
        "non_diegetic_music": "只有观众听到的配乐：乐器、节奏、强弱变化；无配乐用 N/A。",
        "keyframe completion": "首帧、尾帧或关键帧作为具体画面锚点。",
        "reference generation": "参考人物、场景、动作或风格生成新视频。",
        "video editing": "直接修改已有视频，不用于仅参考视频动作。",
        "video continuation": "从已有视频结束处继续发展。",
        "audio reuse": "完整或部分直接使用原音频。",
        "audio reference": "参考音色、节奏或表现，不直接复制音频。",
        "Subject": "人物、场景或物体；编号始终对应同一对象。",
        "Picture": "具体参考帧或构图锚点；编号须与实际输入对应。",
        "Video": "被编辑、续写或参考剪辑结构的原视频。",
        "Audio": "原声复用或声音参考；不要凭空假设音频已输入。",
        "[Shot N]": "首镜头无时间戳；后续镜头写递增的切换时间。",
        "(S1)": "说话者编号；按首次发声顺序分配，并保持一致。",
        "(S1,S2)": "已有多个说话者同时发声时合并编号。",
        "<d>[Language] …</d>": "对白／歌词：替换语言名并填写原文，人物和动作写在标签外。",
        "<scenetrans>": "同一句对白跨切镜时，两侧衔接处使用，并说明声音连续。",
        "<cutoff>": "视频结束时对白被截断。",
        "[unclear]": "参考音频听不清的词段，不要猜测对白。",
        "off-screen voiceover": "画外音；对应画中人物嘴唇保持闭合。",
        "combination": "组合任务类型，用 + 连接；仅选择实际需要的关系。",
        "N/A": "无对应声音：环境声段表示完全静音；配乐段表示无配乐。"
    },
    "en": {
        "Chinese": "Chinese", "English": "English", "Japanese": "Japanese",
        "subject_definitions": "Define reference identities and their source assets.",
        "summary": "Summarize the task with a bracketed task prefix; reuse defined references.",
        "retention_analysis": "Explain preservation or changes for each reference on its own line.",
        "detailed_description": "Reference-mode shots: visuals, action, camera, dialogue and synchronized sound.",
        "integrated_multimodal_description": "Text/keyframe-mode body; start with [Shot 1] without a timestamp.",
        "overall_soundscape": "Overall ambience and physical sounds; N/A only for complete silence.",
        "non_diegetic_music": "Audience-only score: instruments, tempo and dynamics; N/A for no score.",
        "keyframe completion": "Use images as concrete frame anchors.",
        "reference generation": "Generate new video guided by reference features.",
        "video editing": "Directly edit an existing video.",
        "video continuation": "Continue from the source video ending.",
        "audio reuse": "Reuse the original audio signal in whole or part.",
        "audio reference": "Reference timbre, rhythm or delivery without copying the signal.",
        "Subject": "A reusable character, scene or object with a stable ID.",
        "Picture": "A concrete reference frame; match the actual input numbering.",
        "Video": "A source video used for editing, continuation or shot structure.",
        "Audio": "Reused or referenced audio; requires the corresponding input.",
        "[Shot N]": "First shot has no timestamp; later shots need increasing cut times.",
        "(S1)": "Speaker identity, assigned by first vocal appearance and reused.",
        "(S1,S2)": "Existing speakers vocalizing together.",
        "<d>[Language] …</d>": "Dialogue/lyrics: set language and exact words; actions stay outside.",
        "<scenetrans>": "Mark both sides of a cut crossed by continuous speech.",
        "<cutoff>": "Speech cut off by the video ending.",
        "[unclear]": "Unintelligible source words; do not invent a transcript.",
        "off-screen voiceover": "Off-screen narration; the on-screen character keeps lips closed.",
        "combination": "Combine applicable task types with +; avoid duplicates.",
        "N/A": "No sound for this layer: complete silence for soundscape, no score for music."
    },
    "ja": {
        "Chinese": "中国語", "English": "英語", "Japanese": "日本語",
        "subject_definitions": "参照対象・番号・元の素材を定義します。",
        "summary": "[タスク種別] から概要を記述し、定義済みの参照番号を使います。",
        "retention_analysis": "参照ごとに保持・変更・転用する特徴を記述します。",
        "detailed_description": "参照モードの本文：映像・動作・カメラ・台詞・同期音をショット順に記述。",
        "integrated_multimodal_description": "テキスト・キーフレームモード本文。[Shot 1] に時刻は付けません。",
        "overall_soundscape": "全編の環境音と動作音。完全無音の場合のみ N/A。",
        "non_diegetic_music": "観客だけに聞こえる音楽：楽器・テンポ・強弱。音楽なしは N/A。",
        "keyframe completion": "画像を開始・終了・キーフレームとして使用。",
        "reference generation": "人物・場面・動作・スタイルを参考に新規生成。",
        "video editing": "既存動画を直接編集。",
        "video continuation": "元動画の終わりから続きを生成。",
        "audio reuse": "元音声を全部または一部そのまま再利用。",
        "audio reference": "音声をコピーせず声質・リズム・表現を参考にする。",
        "Subject": "人物・場面・物体。番号は同じ対象に固定。",
        "Picture": "参照フレーム・構図。実際の入力番号と一致させます。",
        "Video": "編集・続き・構成を参照する元動画。",
        "Audio": "再利用・参照する音声。対応する入力が必要。",
        "[Shot N]": "最初のショットは時刻なし。以降は昇順の切替時刻を記述。",
        "(S1)": "初めて発声する順に話者番号を付け、継続使用。",
        "(S1,S2)": "既存の複数話者が同時に発声。",
        "<d>[Language] …</d>": "台詞・歌詞：言語と原文を入力。人物や動作はタグの外。",
        "<scenetrans>": "台詞がカットをまたぐ両側に入れ、音の連続を記述。",
        "<cutoff>": "動画終了で台詞が途切れる箇所。",
        "[unclear]": "元音声で聞き取れない箇所。推測して補いません。",
        "off-screen voiceover": "画面外のナレーション。画面内人物は口を閉じたまま。",
        "combination": "必要なタスク種別のみ + で組み合わせ、重複させません。",
        "N/A": "環境音欄では完全無音、音楽欄では音楽なし。"
    }
});
export const H3_SECTIONS = ["subject_definitions", "summary", "retention_analysis", "detailed_description", "integrated_multimodal_description", "overall_soundscape", "non_diegetic_music"];
const TASKS = ["keyframe completion", "reference generation", "video editing", "video continuation", "audio reuse", "audio reference"];
const REFERENCES = ["Subject", "Picture", "Video", "Audio"];
const SHOT_SNIPPETS = [["[Shot N]", "[Shot 1] "], ["(S1)", "(S1) "], ["(S1,S2)", "(S1,S2) "], ["<d>[Language] …</d>", "<d>[English] </d>"], ["<scenetrans>", "<scenetrans>"], ["<cutoff>", "<cutoff>"], ["[unclear]", "[unclear]"], ["off-screen voiceover", "says in an off-screen voiceover: <d>[English] </d> while their lips remain completely closed."]];

export function h3Section(value, cursor) {
    const headers = [...value.slice(0, cursor).matchAll(/^[ \t]*([a-z][a-z0-9_]*):/gm)];
    return headers.at(-1)?.[1] || '';
}

function entry(name, insert = name, detail = name) { return {name, insert, file:T(detail)}; }

function children(section, value, cursor) {
    const before = value.slice(0, cursor);
    const references = REFERENCES.map(kind => {
        const ids = [...before.matchAll(new RegExp(`<${kind} (\\d+)>`, 'g'))].map(match => Number(match[1]));
        const n = section === 'subject_definitions' ? Math.max(0, ...ids) + 1 : (ids[0] || 1);
        return entry(`<${kind} ${n}>`, `<${kind} ${n}>${section === 'retention_analysis' ? ': ' : ' '}`, kind);
    });
    if (section === 'summary') return [...TASKS.map(key => entry(`[${key}]`, `[${key}] `, key)),
        ...['video editing + reference generation + audio reuse','video editing + audio reuse','video continuation + keyframe completion'].map(key => entry(`[${key}]`, `[${key}] `, 'combination'))];
    if (section === 'subject_definitions' || section === 'retention_analysis') return references;
    if (section === 'overall_soundscape' || section === 'non_diegetic_music') return [entry('N/A'), references[3]];
    if (section === 'detailed_description' || section === 'integrated_multimodal_description') {
        const shots = [...before.matchAll(/\[Shot (\d+)\]/g)].map(match => Number(match[1]));
        const n = Math.max(0, ...shots) + 1;
        return [...SHOT_SNIPPETS.map(([name, insert]) => entry(name, name === '[Shot N]' ? `[Shot ${n}] ${n === 1 ? '' : 'At 00:00.000, '}` : insert)), ...references];
    }
    return [];
}

export function h3Query(value, cursor) {
    const before = value.slice(0,cursor);
    const trigger = before.match(/(?:^|\s)(::?h3|::d)(?:[ \t]+([^\n]*))?$/);
    if (!trigger) return null;
    const start = before.lastIndexOf(trigger[1]);
    const section = h3Section(value,start);
    const query = trigger[2] || '';
    if (trigger[1] === '::d') {
        const locale = getLocale();
        const languages = [['zh', 'Chinese'], ['en', 'English'], ['ja', 'Japanese']];
        languages.sort((a, b) => Number(b[0] === locale) - Number(a[0] === locale));
        return {start, end:cursor, query, dialogue:true, options:languages.map(([, language]) => ({
            name:T(language), file:`<d>[${language}]…</d>`, insert:`<d>[${language}]</d>`, caretOffset:language.length + 5,
        }))};
    }
    if (trigger[1] === ':h3') {
        const line = before.slice(before.lastIndexOf('\n')+1,start);
        return {start,end:cursor,query,options:H3_SECTIONS.map(key => entry(key, `${line.trim() ? '\n' : ''}${key}: `))};
    }
    const prefix = before.slice(0,start);
    if (section === 'summary') {
        const combined = prefix.match(/(?:^|\n)[ \t]*summary:[ \t\r\n]*\[([^\]\n]*)$/);
        if (combined) {
            const parts = combined[1].split('+').map(part=>part.trim());
            if (parts.pop() || parts.some(part=>!TASKS.includes(part))) return null;
            return {start,end:cursor+(value[cursor] === ']' ? 1 : 0),query,
                options:TASKS.filter(key=>!parts.includes(key)).map(key=>entry(key,`${key}]`,key))};
        }
    }
    return {start,end:cursor,query,section,options:children(section,value,start)};
}
