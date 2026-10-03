import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _receiveProjectVideo(detail) {');
const receive = new Function('CapTimelineEditorApp', 'normalizeOutputVideoPath',
    `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}})._receiveProjectVideo`)(
    { _graphRoot: graph => graph }, file => file && !file.includes('..') ? file : null);
let saved = 0;
const project = { composed_videos: [{file:'old.mp4'}] };
const editor = {
    node: {graph:{id:'workflow'}}, _timelineReady:true, _projectVideos:[],
    _isNodeOnLiveGraph:()=>true, _teNotifyBelongsHere:id=>id === 'clip-a',
    _parseProjectWidgetValue:()=>({project}), _renderProjectVideos(){},
    _saveToWidgets(){saved++;}, _writeProjectJson(value){this.written = JSON.parse(value);},
};
const detail = {workflow_id:'workflow', video:{type:'output', filename:'final.mp4', subfolder:'compose', source_clip_ids:['clip-a']}};
receive.call(editor, {...detail, workflow_id:'other'});
receive.call(editor, {...detail, video:{...detail.video, source_clip_ids:['other-clip']}});
assert.equal(saved, 0);
receive.call(editor, detail);
receive.call(editor, detail);
assert.deepEqual(editor._projectVideos, [{file:'compose/final.mp4'}]);
assert.equal(saved, 1, 'repeated final notifications must not duplicate the saved entry');
editor._timelineReady = false;
receive.call(editor, detail);
assert.deepEqual(editor.written.composed_videos, [{file:'compose/final.mp4'}, {file:'old.mp4'}]);
assert.match(source, /composed_videos: this\._projectVideos/);
assert.equal(source.match(/this\._projectVideos = \(project\.composed_videos/g).length, 2, 'restore on project load and undo');
console.log('PASS: project video routing, deduplication, closed-editor persistence and restore');

const selectionStart = source.indexOf('        tl.on("clip:select",', source.indexOf('    _bindTimelineEvents() {'));
const selectionEnd = source.indexOf('        tl.on("clip:add",', selectionStart);
let select;
const bindSelection = new Function('tl', source.slice(selectionStart, selectionEnd));
const selectionEditor = {
    _projectVideosActive: true,
    _syncSelectedClip() {}, _updateMediaPreviewInsertBtn() {}, _retargetOutputVideosPickerFromSelection() {},
    _updatePromptPanel() { assert.equal(this._projectVideosActive, false, 'Clip selection must leave video list before panel refresh'); },
};
bindSelection.call(selectionEditor, {on(name, callback) { select = callback; }});
select({selected:[{id:'clip-a'}]});
assert.equal(selectionEditor._projectVideosActive, false);
