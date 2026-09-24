import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/cap_timeline_editor.js', import.meta.url), 'utf8');
const start = source.indexOf('function markNoSerialize(');
const end = source.indexOf('\nfunction ensureTimelineApp', start);
const mark = new Function('ComfyWidgets', 'app', 'preserveLegacyPromptFields', 'removeObsoleteWidgets', source.slice(start, end) + ';return markNoSerialize;')({
    STRING(node, name) {
        const widget = { name, value: '', element: { style: {} } };
        node.widgets.push(widget);
        return { widget };
    },
}, {}, () => {}, () => {});
const project = { name: 'project_json', value: '{"tracks":[]}' };
const node = { widgets: [project], properties: { cat_named: { storyboard_json: '{"schema_version":1,"shots":[]}' } } };
mark(node);
const widget = node.widgets.find(w => w.name === 'storyboard_json');
assert.equal(widget.value, node.properties.cat_named.storyboard_json);
assert.equal(widget.hidden, true);
assert.equal(widget.element.style.display, 'none');
assert.notEqual(widget.serialize, false);
assert.equal(project.value, '{"tracks":[]}');
mark(node);
assert.equal(node.widgets.filter(w => w.name === 'storyboard_json').length, 1);
assert.equal(widget.value, node.properties.cat_named.storyboard_json);
console.log('Legacy nodes: missing storyboard field created, hidden, serializable; existing data preserved; no duplicates');
const restoreStart = source.indexOf('function configuredNamedValues(');
const restoreEnd = source.indexOf('\nfunction preserveLegacyPromptFields', restoreStart);
const restore = new Function('LEGACY_PROMPT_FIELDS', source.slice(restoreStart, restoreEnd) + ';return configuredNamedValues;')([]);
const legacy = { inputs: [{ name: 'fps', widget: {} }, { name: 'project_json', widget: {} }], widgets_values: [24, project.value, 1], properties: { cat_named: { project_json: project.value } } };
assert.equal(restore(legacy).storyboard_json, '', 'old workflows explicitly clear the new positional field');
assert.equal(restore(legacy).project_json, project.value);
const saved = '{"schema_version":1,"shots":[{"id":"shot-1"}]}';
assert.equal(restore({ ...legacy, properties: { cat_named: { storyboard_json: saved } } }).storyboard_json, saved);
assert.equal(restore({ inputs: [{ name: 'storyboard_json', widget: {} }], widgets_values: ['invalid'] }).storyboard_json, 'invalid', 'explicit data is not silently discarded');
console.log('Legacy restore: absent storyboard slot reset; named and explicit storyboard data preserved');
