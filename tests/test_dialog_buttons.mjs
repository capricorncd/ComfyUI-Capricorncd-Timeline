import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const app = read('js/CapTimelineEditorApp.js');
const nativeButton = /<button\b|createElement\(["']button["']\)/;
const start = app.indexOf('<div class="cat-te-modal-backdrop cat-te-media-preview-modal"');
const markup = app.slice(start, app.indexOf('`;', start));
assert(start > 0 && markup.includes('cat-te-agent-save'), 'scan the complete dialog markup');
assert(!nativeButton.test(markup), 'all static dialog buttons use components');
for (const name of ['_showGenVideoGeneration', '_setupGenEditTrackControls', '_setupGenEditAudioTrackControls',
    '_attachPromptCopyButtons', '_setupVoiceoverEditTrackControls', '_renderOutputVideosPicker',
    '_renderSkillPicker']) {
    const start = app.search(new RegExp('    (?:async )?' + name + '\\('));
    assert(start >= 0, name + ' exists');
    assert(!nativeButton.test(app.slice(start, app.indexOf('\n    }', start))), name + ' dynamic buttons use components');
}
for (const path of ['js/editor/AgentSettings.js', 'js/editor/BgmSettings.js', 'js/editor/VoiceSettings.js',
    'js/editor/CharacterVoice.js', 'js/editor/FontPicker.js', 'js/editor/SubtitleSpeech.js', 'js/cap_ui.js']) {
    assert(!nativeButton.test(read(path)), path + ' uses components');
}
const library = read('js/cap_prompt_library.js');
assert(!nativeButton.test(library.slice(0, library.indexOf('function bindPromptHeaderButtons'))), 'prompt-library popup uses components');
assert.match(app, /field\.focusable \?\? field\.tabIndex >= 0/, 'legacy focus trap includes component controls');
assert.match(app, /chip\.setAttribute\("aria-pressed", String\(active\)\)/, 'prompt inclusion selection is explicit');
assert.match(read('js/components/TabButton.js'), /_button\.setAttribute\("role", "tab"\)/);
assert.match(read('js/components/Dialog.js'), /closest\("button, cap-button, cap-tab-button,/);
console.log('Dialog button migration coverage passed');
