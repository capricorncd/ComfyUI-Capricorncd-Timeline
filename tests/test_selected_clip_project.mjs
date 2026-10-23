import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectedClipProject} from '../js/editor/SelectedClipProject.js';
import {createProjectIdentity} from '../js/editor/ProjectIdentity.js';

const source = {id:'original-project',created_at:'2026-01-01T00:00:00+09:00',created_at_source:'first_seen',name:'Original',project_directory:'original-folder',settings:{fps:24,width:544,height:960,current_time:22},
    composed_videos:[{file:'final.mp4'}], media:[
        {id:'video',file:'trim.mp4',video_trim:{source_id:'original'}},
        {id:'original',file:'original.mp4'},
        {id:'hero',file:'hero.png',voice_audio_id:'voice'},
        {id:'voice',file:'voice.wav'},
        {id:'child',file:'child.mp4'},
        {id:'unused',file:'unused.png'},
    ],tracks:[
        {id:'director',clips:[{id:'a',start_ms:12000,duration_ms:3000,source_in_ms:5000,
            media_ids:['video'],prompt_media_ids:['hero'],keyframes:{points:[{time:5,description:'action'}]},
            reference_timeline:{videos:[{media_id:'child',start_ms:1000,trim_in:3}]}},
            {id:'unused',start_ms:0,duration_ms:2000}]},
        {id:'audio',clips:[{id:'b',start_ms:16000,duration_ms:2000,source:{file:'voice.wav'}}]},
        {id:'empty',clips:[]},
    ]};
const before = structuredClone(source);
const project = selectedClipProject(source, ['a','b'], 'Selected');
assert.deepEqual(source, before, 'original project must stay unchanged');
assert.deepEqual(project.tracks.map(track=>track.clips[0].start_ms), [0,4000]);
assert.equal(project.tracks[0].clips[0].source_in_ms, 5000);
assert.equal(project.tracks[0].clips[0].keyframes.points[0].time, 5);
assert.equal(project.tracks[0].clips[0].reference_timeline.videos[0].start_ms, 1000);
assert.deepEqual(project.media.map(media=>media.id), ['video','original','hero','voice','child']);
assert.equal(project.project_directory, undefined);
assert.equal(project.settings.current_time, 0);
assert.deepEqual(project.composed_videos, []);
assert.equal(project.name, 'Selected');
assert.equal(selectedClipProject(source, [], 'Empty'), null);
console.log('Selected Clip project: zero alignment, relative timing, source/keyframes, child timeline, transitive media and original isolation passed');

const code = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const rootStart = code.indexOf('    static _graphRoot(');
const CapTimelineEditorApp = new Function(`return ({${code.slice(rootStart, code.indexOf('\n    }', rootStart)+6).replace('static ', '')}})`)();
const start = code.indexOf('    async _newProjectFromSelectedClips() {');
let loaded, closed = false;
let temporary;
const api = {extensionManager:{workflow:{createTemporary(filename, data) {
    temporary = {filename, data};
    return temporary;
}}}, async loadGraphData(...args) {loaded = args;}};
const create = new Function('selectedClipProject','createProjectIdentity','CapTimelineEditorApp','T','buildStoryboardDocument','app','showCapAlert',
    `return ({${code.slice(start,code.indexOf('\n    }',start)+6)}})._newProjectFromSelectedClips`)(
    selectedClipProject,createProjectIdentity,CapTimelineEditorApp,key=>key === 'untitled_project' ? '\u672a\u547d\u540d\u9879\u76ee' : key,shots=>({schema_version:1,shots}),api,error=>{throw new Error(error);});
const graph = {};
const workflow = {id:'old-workflow',nodes:[{id:7,widgets_values:['old-project','old-storyboard'],properties:{cat_named:{project_json:'old-project'}}}]};
await create.call({_canCreateProject:()=>true,_timeline:{getSelectedClips:()=>[{id:'a'}]},
    _exportWorkflowSnapshot:()=>structuredClone(workflow),_buildProject:()=>source,
    node:{id:7,graph,widgets:[{name:'project_json'},{name:'storyboard_json'}]},close(){closed=true;}});
assert(closed);
assert.notEqual(loaded[0].id, workflow.id);
assert.deepEqual(loaded.slice(1), [true,true,temporary]);
const now = new Date();
const name = `${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-\u672a\u547d\u540d\u9879\u76ee`;
assert.equal(temporary.filename, `${name}.json`);
assert.equal(temporary.data, loaded[0]);
const copiedNode = loaded[0].nodes[0];
assert.equal(copiedNode.widgets_values[0], copiedNode.properties.cat_named.project_json);
assert.equal(JSON.parse(copiedNode.widgets_values[0]).project_directory, undefined);
assert.equal(JSON.parse(copiedNode.widgets_values[0]).tracks[0].clips[0].start_ms, 0);
const newProject = JSON.parse(copiedNode.widgets_values[0]);
assert.equal(newProject.name, name);
assert.notEqual(newProject.id, source.id);
assert.notEqual(newProject.created_at, source.created_at);
assert.equal(newProject.created_at_source, 'new_project');
assert.equal(workflow.nodes[0].widgets_values[0], 'old-project');
assert.deepEqual(source, before);
console.log('New workflow tab: distinct identity, named/indexed project data, empty directory and source workflow preservation passed');

function editorMethod(name) {
    const start = code.indexOf(`    ${name}(`);
    return new Function('CapTimelineEditorApp', 'app', 'T',
        `return ({${code.slice(start, code.indexOf('\n    }', start)+6)}}).${name}`)(CapTimelineEditorApp, api, key=>key);
}
const subgraphNode = structuredClone(workflow.nodes[0]);
const subgraphWorkflow = {id:'original-workflow', nodes:[{id:1,type:'subgraph'}],
    definitions:{subgraphs:[{id:'nested',nodes:[subgraphNode]}]}};
const rootGraph = {serialize:()=>structuredClone(subgraphWorkflow)};
const subgraph = {id:'nested',get rootGraph() {return rootGraph;}};
api.rootGraph = rootGraph;
let saved = 0;
const editor = {_canCreateProject:()=>true,_timeline:{getSelectedClips:()=>[{id:'a'}]},
    _buildProject:()=>source,_saveToWidgets(){saved++;},
    _isNodeOnLiveGraph:editorMethod('_isNodeOnLiveGraph'),
    _exportWorkflowSnapshot:editorMethod('_exportWorkflowSnapshot'),
    node:{id:7,graph:subgraph,widgets:[{name:'project_json'},{name:'storyboard_json'}]},close(){closed=true;}};
await create.call(editor);
assert.equal(saved,1, 'subgraph editor must save to widgets before taking the workflow snapshot');
assert.equal(loaded[0].nodes[0].type,'subgraph');
const copiedSubgraphNode = loaded[0].definitions.subgraphs[0].nodes[0];
assert.equal(JSON.parse(copiedSubgraphNode.widgets_values[0]).name,name);
assert.equal(JSON.parse(copiedSubgraphNode.widgets_values[0]).tracks[0].clips[0].start_ms,0);
assert.deepEqual(subgraphWorkflow.definitions.subgraphs[0].nodes[0],subgraphNode);
api.rootGraph = {};
assert.equal(editor._isNodeOnLiveGraph(),false,'another workflow must still be rejected');
assert.throws(()=>editor._exportWorkflowSnapshot(),/export_workflow_unavailable/);
console.log('Native rootGraph subgraph: live editor detection, root workflow snapshot, copied node updates and stale workflow guard passed');
