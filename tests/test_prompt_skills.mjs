import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../js/components/PromptSkills.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('export function copyPromptSkills'), source.indexOf('class PromptSkills')).replaceAll('export ', '');
const {copyPromptSkills, enabledPromptSkills, parsePromptSkills, mergePromptSkills} = new Function(helpers + '\nreturn {copyPromptSkills, enabledPromptSkills, parsePromptSkills, mergePromptSkills};')();
const rows = [{id:'official__one', name:'One', text:'rule one', enabled:true}, {id:'custom', name:'Two', text:'rule two', enabled:false}];
assert.equal(enabledPromptSkills(rows), 'rule one');
const copy = copyPromptSkills(rows); copy[0].enabled = false; assert.equal(rows[0].enabled, true);
const restored = parsePromptSkills(JSON.stringify({schema_version:1,prompt_skills:rows}), 'skills.json');
assert.deepEqual(restored, rows);
assert.deepEqual(parsePromptSkills('# My rule', 'custom.md', () => 'uuid'), [{id:'uuid',name:'custom',text:'# My rule',enabled:true}]);
assert.deepEqual(mergePromptSkills(rows, rows), rows);
const merged = mergePromptSkills(rows, [{...rows[0],text:'edited rule'}], () => 'new-uuid');
assert.equal(merged.length,3); assert.equal(merged[2].id,'new-uuid'); assert.equal(merged[0].text,'rule one');
for (const data of [{schema_version:2,prompt_skills:rows},{schema_version:1,prompt_skills:[...rows,rows[0]]},{schema_version:1,prompt_skills:[{...rows[0],enabled:'false'}]}]) {
    assert.throws(() => parsePromptSkills(JSON.stringify(data),'skills.json'));
}
console.log('PASS: enabled order, copy isolation, JSON round trip, Markdown import, ID collision preservation and invalid imports');
