import { t as T } from '../i18n/timeline_editor.js';

// Optional request fields from Local AI Service's audio API.
const number = (name, label, min, max, step = 'any') => ({ name, label, min, max, step, type: 'number' });
const text = (name, label, maxLength) => ({ name, label, maxLength, type: 'text' });
const select = (name, label, choices) => ({ name, label, choices });
const seed = max => number('seed', 'clip_seed_label', 0, max, 1);
const options = {
    music: [
        text('title', 'audio_option_title', 120), text('workspace', 'audio_option_workspace', 60),
        select('mode', 'audio_option_planning', ['full', 'melody', 'off']),
        select('generate_score', 'audio_option_score', ['false', 'true']),
        number('count', 'audio_option_count', 1, 2, 1), seed(4294967294),
        number('steps', 'local_audio_steps', 1, 100, 1), number('cfg', 'local_audio_cfg', 0, 20),
        number('temperature', 'audio_option_temperature', 0.01, 5), number('top_p', 'Top P', 0.01, 1),
        number('top_k', 'Top K', 1, 32768, 1), number('repetition_penalty', 'audio_option_repetition', 0.01, 10),
        select('lora_provider', 'audio_option_lora', ['none', 'speedyrulz', 'starnodes2024']),
        text('acoustic_lora', 'audio_option_acoustic', 1024), number('acoustic_strength', 'audio_option_acoustic_strength', 0, 3),
        text('planner_lora', 'audio_option_planner', 1024), number('planner_strength', 'audio_option_planner_strength', 0, 3),
    ],
    sfx: [text('negative_prompt', 'audio_option_negative', 4000), number('count', 'audio_option_count', 1, 4, 1),
        seed(4294967292), number('num_inference_steps', 'local_audio_steps', 1, 200, 1),
        number('cfg_scale', 'local_audio_cfg', 1, 20), number('sigma_shift', 'Sigma shift', Number.MIN_VALUE, 20)],
    denoise: [number('segment_seconds', 'local_audio_segment', 4, 120), number('max_duration', 'local_audio_duration', 1, 7200, 1)],
    separation: [select('mode', 'audio_option_separation', ['speakers', 'music', 'both']), text('title', 'audio_option_title', 120),
        number('segment_seconds', 'local_audio_segment', 2, 120), number('max_duration', 'local_audio_duration', 1, 7200, 1)],
    tts: [seed(4294967295), number('temperature', 'audio_option_temperature', 0.1, 2),
        number('max_new_tokens', 'audio_option_tokens', 128, 4096, 1), number('cfg_scale', 'local_audio_cfg', Number.MIN_VALUE, 20)],
    vc: [seed(4294967295), number('diffusion_steps', 'local_audio_steps', 1, 200, 1),
        number('inference_cfg_rate', 'local_audio_cfg', 0, 1), number('length_adjust', 'audio_option_length', 0.5, 2)],
};

export class AudioOptions {
    constructor(root, kind) {
        this.root = root;
        this.kind = kind;
        root.innerHTML = `<summary>${T('audio_optional_parameters')}</summary><p>${T('audio_optional_default')}</p>`;
        for (const field of options[kind]) {
            const label = document.createElement('label');
            const title = document.createElement('span');
            title.textContent = T(field.label);
            const input = document.createElement(field.choices ? 'select' : 'input');
            input.dataset.audioOption = field.name;
            if (field.choices) {
                input.add(new Option(T('audio_optional_default'), ''));
                for (const choice of field.choices) input.add(new Option(T('audio_choice_' + choice), choice));
            } else {
                input.type = field.type;
                if (field.type === 'number') Object.assign(input, { min: field.min, max: field.max, step: field.step });
                else input.maxLength = field.maxLength;
                input.placeholder = T('audio_optional_default');
            }
            label.append(title, input);
            root.append(label);
        }
    }

    setModel(model) {
        for (const input of this.root.querySelectorAll('[data-audio-option]')) {
            const name = input.dataset.audioOption;
            input.disabled = model === 'breeze-tts2' ? ['temperature', 'max_new_tokens'].includes(name) : name === 'cfg_scale';
            input.parentElement.hidden = input.disabled;
        }
    }

    values() {
        const result = {};
        for (const input of this.root.querySelectorAll('[data-audio-option]')) {
            if (input.disabled) continue;
            if (!input.reportValidity()) return null;
            if (!input.value.trim()) continue;
            result[input.dataset.audioOption] = input.type === 'number' ? Number(input.value)
                : input.dataset.audioOption === 'generate_score' ? input.value === 'true' : input.value.trim();
        }
        return result;
    }
}
