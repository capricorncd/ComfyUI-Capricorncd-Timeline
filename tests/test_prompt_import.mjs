import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('function joinPromptParts('), source.indexOf('function genVideoUid('));
const scope = new Function(helpers + '\nreturn {joinPromptParts,migrateProjectSettingPrompts};')();
function method(name) {
    const start = source.indexOf('    ' + name + '(');
    return new Function('parseSchemaVersion', 'T', 'promptIncludesFromClipJson', 'migrateProjectSettingPrompts', 'joinPromptParts',
        `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}}).${name}`)(
        p => Number(p.schema_version) || 1, key => key, c => c.prompt_includes || ['clip'],
        scope.migrateProjectSettingPrompts, scope.joinPromptParts);
}
const editor = {_loadMediaStarsForDir(){}, _hydrateMediaCatalog(){},
    _currentVersion:()=> 'test', _currentSchemaVersion:()=>4};
for (const name of ['_migrateProjectDocument','_migrateLegacyClipPrompts','_migrateProjectSchema3To4']) editor[name] = method(name);
const prompt = sound => `  # 保留注释\r\nsubject_definitions:\r\n角色\r\n\r\nsummary:\r\n总结\r\nretention_analysis:\r\n原样\r\ndetailed_description:\r\n动作\r\noverall_soundscape:\r\n${sound}\r\nnon_diegetic_music:\r\nn/a.\r\ncustom_section:\r\n日本語 / English  \r\n`;
const project = {schema_version:4, name:'preserve', media:[], settings:{
    prepend_prompt:'  风格\n# comment\n', append_prompt:'non_diegetic_music:\nn/a.',
    negative_prompt:'stale legacy setting',
}, tracks:[{type:'director',clips:[{id:'a',prompt:prompt('雨声')},{id:'b',prompt:prompt('鸟鸣')}]}]};
const before = structuredClone(project);
let imported = editor._migrateProjectDocument(project);
for (let n=0;n<3;n++) {
    assert.deepEqual(imported.tracks[0].clips.map(c=>c.prompt), project.tracks[0].clips.map(c=>c.prompt));
    assert.equal(imported.settings.append_prompt, project.settings.append_prompt);
    assert.equal(imported.settings.prepend_prompt, project.settings.prepend_prompt);
    imported = editor._migrateProjectDocument(JSON.parse(JSON.stringify(imported)));
}
assert.deepEqual(project, before, 'import does not mutate the input document');
const blank = editor._migrateProjectDocument({...project,settings:{prepend_prompt:'',append_prompt:'',negative_prompt:'do not resurrect'}});
assert.equal(blank.settings.append_prompt,'');
const stale = structuredClone(project);
stale.tracks[0].clips[0].ai_prompt='old duplicated prompt';
stale.tracks[0].clips[0].detailed_description='old duplicated description';
assert.equal(editor._migrateProjectDocument(stale).tracks[0].clips[0].prompt,project.tracks[0].clips[0].prompt);
const legacy = editor._migrateProjectDocument({schema_version:3,media:[],settings:{append_prompt:'non_diegetic_music:\nn/a.'},
    tracks:[{clips:[{prompt:'subject_definitions:\n角色',detailed_description:'动作\noverall_soundscape:\n雨声'}]}]});
assert(legacy.tracks[0].clips[0].prompt.includes('overall_soundscape:\n雨声'));
assert.equal(legacy.settings.append_prompt,project.settings.append_prompt,'legacy field migration never promotes local sounds');
assert(!source.includes('splitH3ProjectPrompt('));
console.log('PASS: prompt import is lossless for schema 4, repeated loads, blank globals, stale aliases and clip-local legacy sounds');
