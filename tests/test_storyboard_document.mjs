import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseStoryboardDocument, buildStoryboardDocument } from '../js/editor/StoryboardDocument.js';

const legacy = [{ id: 'shot1', title: '尝汤', duration: 15.5, source_clip_id: 'clip1' }];
const migrated = parseStoryboardDocument('', legacy);
assert.equal(migrated.schema_version, 1);
assert.equal(migrated.shots[0].duration, 15.5);
assert.equal(migrated.shots[0].source_clip_id, 'clip1');
assert.deepEqual(parseStoryboardDocument(JSON.stringify(migrated)), migrated);
assert.deepEqual(parseStoryboardDocument({ schema_version: 1, shots: [] }, legacy).shots, []);
for (const value of [{ schema_version: 2, shots: legacy }, { schema_version: 0, shots: [] }, { schema_version: '1', shots: [] }, { shots: [] }, { schema_version: 1, shots: [null] }, '{']) {
    assert.throws(() => parseStoryboardDocument(value));
}
const copied = buildStoryboardDocument(migrated.shots);
copied.shots[0].title = 'changed';
assert.equal(migrated.shots[0].title, '尝汤');

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
    const start = source.indexOf('    ' + name + '(');
    return new Function('buildStoryboardDocument', 'parseStoryboardDocument', 'return ({' + source.slice(start, source.indexOf('\n    }', start) + 6) + '}).' + name)(buildStoryboardDocument, parseStoryboardDocument);
}
const widgets = [{ name: 'project_json', value: '{}' }, { name: 'storyboard_json', value: '' }, { name: 'te_launcher', serialize: false }];
const editor = {
    node: { widgets, properties: {} }, _timeline: {}, _timelineReady: true, _storyboards: migrated.shots,
    _isNodeOnLiveGraph: () => true, _w: name => widgets.find(w => w.name === name),
    _buildProject: () => ({ name: 'Project', tracks: [] }), _persistViewToLocalCache() {}, _persistPanelLayout() {},
};
for (const name of ['_saveToWidgets', '_writeProjectJson', '_buildStoryboardDocument', '_editorContentJson', '_hasUnsavedChanges', '_captureSnapshot', '_loadStoryboards']) editor[name] = method(name);
editor._saveToWidgets();
assert(!Object.hasOwn(JSON.parse(widgets[0].value), 'storyboards'));
assert.deepEqual(JSON.parse(widgets[1].value), migrated);
assert.equal(editor.node.widgets_values[1], widgets[1].value);
assert.equal(editor.node.properties.cat_named.storyboard_json, widgets[1].value);
editor._openedProjectJson = editor._editorContentJson();
assert(!editor._hasUnsavedChanges());
const snapshot = editor._captureSnapshot();
editor._storyboards[0].dialogue = '加点盐。';
assert(editor._hasUnsavedChanges());
assert.equal(snapshot.storyboard.shots[0].dialogue, '');
editor._loadStoryboards(snapshot.storyboard);
assert(!editor._hasUnsavedChanges());
const before = widgets[1].value;
assert.throws(() => editor._loadStoryboards({ schema_version: 99, shots: [] }));
assert.equal(widgets[1].value, before);
const frontend = readFileSync(new URL('../js/cap_timeline_editor.js', import.meta.url), 'utf8');
const hideStart = frontend.indexOf('function markNoSerialize(');
const hide = new Function('preserveLegacyPromptFields', 'removeObsoleteWidgets', frontend.slice(hideStart, frontend.indexOf('\n}', hideStart) + 2) + ';return markNoSerialize;')(() => {}, () => {});
const hidden = { name: 'storyboard_json', value: JSON.stringify(migrated), element: { style: {} } };
hide({ widgets: [hidden] });
assert.equal(hidden.hidden, true);
assert.equal(hidden.element.style.display, 'none');
assert.notEqual(hidden.serialize, false);
assert.equal(JSON.parse(hidden.value).schema_version, 1);
console.log('Storyboard document: version validation, migration, hidden serialized widget, mirrors, snapshots and dirty tracking passed');
