import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectedClipProject} from '../js/editor/SelectedClipProject.js';

const source = {name:'Original',project_directory:'original-folder',settings:{fps:24,width:544,height:960,current_time:22},
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
const start = code.indexOf('    async _newProjectFromSelectedClips() {');
let loaded, closed = false;
const api = {async loadGraphData(...args) {loaded = args;}};
const create = new Function('selectedClipProject','CapTimelineEditorApp','T','buildStoryboardDocument','app','showCapAlert',
    `return ({${code.slice(start,code.indexOf('\n    }',start)+6)}})._newProjectFromSelectedClips`)(
    selectedClipProject,{_graphRoot:graph=>graph},key=>key,shots=>({schema_version:1,shots}),api,error=>{throw new Error(error);});
const graph = {};
const workflow = {id:'old-workflow',nodes:[{id:7,widgets_values:['old-project','old-storyboard'],properties:{cat_named:{project_json:'old-project'}}}]};
await create.call({_canCreateProject:()=>true,_timeline:{getSelectedClips:()=>[{id:'a'}]},
    _exportWorkflowSnapshot:()=>structuredClone(workflow),_buildProject:()=>source,
    node:{id:7,graph,widgets:[{name:'project_json'},{name:'storyboard_json'}]},close(){closed=true;}});
assert(closed);
assert.notEqual(loaded[0].id, workflow.id);
assert.deepEqual(loaded.slice(1), [true,true,'Original - selected_clips.json']);
const copiedNode = loaded[0].nodes[0];
assert.equal(copiedNode.widgets_values[0], copiedNode.properties.cat_named.project_json);
assert.equal(JSON.parse(copiedNode.widgets_values[0]).project_directory, undefined);
assert.equal(JSON.parse(copiedNode.widgets_values[0]).tracks[0].clips[0].start_ms, 0);
assert.equal(workflow.nodes[0].widgets_values[0], 'old-project');
console.log('New workflow tab: distinct identity, named/indexed project data, empty directory and source workflow preservation passed');
