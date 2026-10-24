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
await create.call({_isNodeOnLiveGraph:()=>true,_canCreateProject:()=>true,_timeline:{getSelectedClips:()=>[{id:'a'}]},
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
const subgraph = {id:'nested',get rootGraph() {return rootGraph;},getNodeById:id=>id===7 ? editor.node : null};
rootGraph.subgraphs = new Map([['nested',subgraph]]);
api.rootGraph = rootGraph;
let saved = 0;
const editor = {_canCreateProject:()=>true,_timeline:{getSelectedClips:()=>[{id:'a'}]},
    _buildProject:()=>source,_saveToWidgets(){saved++;},
    _liveNode:editorMethod('_liveNode'),_isNodeOnLiveGraph:editorMethod('_isNodeOnLiveGraph'),
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

api.rootGraph = rootGraph;
const originalNode = editor.node;
const nodeView = new Proxy(originalNode, {});
editor.node = nodeView;
originalNode._teApp = editor;
subgraph.getNodeById = id=>id===7 ? originalNode : null;
assert.equal(editor._isNodeOnLiveGraph(),true,'a wrapped node owned by this editor is still live');
const replacement = {id:7,_teApp:{open(){events.push('open current');}}};
subgraph.getNodeById = ()=>replacement;
assert.equal(editor._isNodeOnLiveGraph(),false,'reused node ids do not keep a stale editor live');
const events = [];
editor.close = ()=>events.push('close stale');
editor.open = editorMethod('open');
await create.call(editor);
assert.deepEqual(events,['close stale','open current'],'stale action closes the old editor and opens the current instance');
replacement._teApp._destroyed = true;
events.length = 0;
editor.open();
assert.deepEqual(events,['close stale'],'a destroyed replacement must not reopen');
subgraph.getNodeById = ()=>null;
events.length = 0;
editor.open();
assert.deepEqual(events,['close stale'],'a removed node closes without exporting a different workflow');
console.log('Stale editor recovery: wrapped nodes, reused ids, automatic close/reopen and missing/destroyed replacements passed');

const wrappedGraph = {id:'root',get rootGraph(){return unwrappedGraph;}};
const unwrappedGraph = {id:'root',getNodeById:()=>originalNode};
api.rootGraph = unwrappedGraph;
editor.node = {...originalNode,graph:wrappedGraph};
assert.equal(editor._isNodeOnLiveGraph(),true,'root graph wrappers resolve through their live node owner');
unwrappedGraph.serialize = () => structuredClone(workflow);
loaded = null;
await create.call(editor);
assert(loaded, 'a live editor on a wrapped root graph must create a new workflow');
assert.equal(JSON.parse(loaded[0].nodes[0].widgets_values[0]).name, name);
assert.notEqual(loaded[0].id, workflow.id);
assert.deepEqual(loaded.slice(1), [true, true, temporary]);
assert.equal(workflow.nodes[0].widgets_values[0], 'old-project');
console.log('Wrapped root graph: selected Clips create and open a distinct workflow without a stale-editor alert');

editor.node = {...originalNode, id:'7', graph:unwrappedGraph};
unwrappedGraph.getNodeById = id => String(id) === '7' ? editor.node : null;
assert.equal(editor._isNodeOnLiveGraph(), true, 'ComfyUI uses string IDs for live nodes');
loaded = null;
await create.call(editor);
assert(loaded, 'serialized numeric node IDs must match the live string node ID');
assert.equal(JSON.parse(loaded[0].nodes[0].widgets_values[0]).name, name);
console.log('Current frontend: runtime string node ID matches numeric workflow serialization');

api.rootGraph = rootGraph;
editor.node = {...originalNode, id:'7', graph:subgraph};
subgraph.getNodeById = id => String(id) === '7' ? editor.node : null;
assert.equal(editor._isNodeOnLiveGraph(), true);
loaded = null;
await create.call(editor);
assert.equal(JSON.parse(loaded[0].definitions.subgraphs[0].nodes[0].widgets_values[0]).name, name);
console.log('Current frontend: subgraph string ID also matches numeric workflow serialization');

const mentionSource = structuredClone(source);
mentionSource.media.push(
    {id:'riley',name:'莱利',file:'riley.png'},
    {id:'riley2',name:'莱利2',file:'riley2.png',voice_audio_id:'rileyVoice'},
    {id:'rileyVoice',file:'riley-voice.wav'},
    {id:'rileyAlt',name:'莱利2号',file:'riley-alt.png'},
    {id:'unnamed',file:'reference still.png'},
    {id:'commentOnly',name:'仅注释',file:'comment-only.png'},
);
mentionSource.tracks[0].clips[0].prompt_media_ids = [];
mentionSource.tracks[0].clips[0].prompt = 'Show @莱利2 and @reference still.png\n// @仅注释';
mentionSource.tracks[0].clips[0].keyframes.points[0].description = 'Keep @莱利2号 visible';
mentionSource.tracks[0].clips[1].prompt = '@莱利 and @莱利2号 belong to the unselected Clip';
const mentionedBefore = structuredClone(mentionSource);
const mentioned = selectedClipProject(mentionSource, ['a'], 'Mentioned');
assert.deepEqual(mentioned.media.map(row => row.id), ['video','original','child','riley2','rileyVoice','rileyAlt','unnamed']);
assert.deepEqual(mentioned.tracks[0].clips[0].prompt_media_ids, ['riley2','rileyAlt','unnamed']);
assert.equal(mentioned.tracks[0].clips[0].prompt, mentionSource.tracks[0].clips[0].prompt);
assert.deepEqual(mentionSource, mentionedBefore, 'copying mentions must preserve the source workflow');

api.rootGraph = unwrappedGraph;
editor.node = {...originalNode,id:'7',graph:unwrappedGraph};
editor._buildProject = () => mentionSource;
loaded = null;
await create.call(editor);
const copiedMentions = JSON.parse(loaded[0].nodes[0].widgets_values[0]);
assert.deepEqual(copiedMentions.media.map(row => row.id), mentioned.media.map(row => row.id));
assert.deepEqual(copiedMentions.tracks[0].clips[0].prompt_media_ids, ['riley2','rileyAlt','unnamed']);
console.log('Prompt @references: copied materials, per-Clip model links, filename fallback, prefix boundary, comments and source isolation passed');

const globalSource = structuredClone(source);
globalSource.media.push({id:'globalRiley2',name:'莱利2',file:'global-riley2.png'});
globalSource.settings.prepend_prompt = 'Every shot shows @莱利2\n// @unused';
const globalBefore = structuredClone(globalSource);
const globalProject = selectedClipProject(globalSource, ['a'], 'Global mention');
assert(globalProject.media.some(row => row.id === 'globalRiley2'));
assert(globalProject.tracks[0].clips[0].prompt_media_ids.includes('globalRiley2'));
assert.deepEqual(globalSource, globalBefore);
editor._buildProject = () => globalSource;
loaded = null;
await create.call(editor);
const copiedGlobal = JSON.parse(loaded[0].nodes[0].widgets_values[0]);
assert.equal(copiedGlobal.settings.prepend_prompt, globalSource.settings.prepend_prompt);
assert(copiedGlobal.media.some(row => row.id === 'globalRiley2'));
assert(copiedGlobal.tracks[0].clips[0].prompt_media_ids.includes('globalRiley2'));
console.log('Project prepend_prompt @reference: asset and model link survive the new workflow');

const everyPromptSource = structuredClone(source);
everyPromptSource.settings.style_prompt = 'Style from @globalStyle';
everyPromptSource.tracks[0].clips[0].style_prompt = 'Paint @clipStyle';
everyPromptSource.tracks[0].clips[0].speech_prompt = 'Voice @clipSpeech';
everyPromptSource.tracks[0].clips[0].h3_drafts = [{prompt:'Draft @draftAsset',keyframe_segment:{prompt:'Interval @intervalAsset'}}];
everyPromptSource.tracks[0].clips[0].reference_timeline.videos[0].prompt = 'Reference @timelineAsset';
everyPromptSource.tracks[0].clips[1].prompt = 'Discarded @unselectedAsset';
everyPromptSource.media.find(row => row.id === 'video').generation_prompt = 'Material @mediaAsset';
everyPromptSource.media.push(
    {id:'globalStyle',name:'globalStyle',file:'global-style.png'},
    {id:'clipStyle',name:'clipStyle',file:'clip-style.png'},
    {id:'clipSpeech',name:'clipSpeech',file:'clip-speech.png'},
    {id:'draftAsset',name:'draftAsset',file:'draft.png'},
    {id:'intervalAsset',name:'intervalAsset',file:'interval.png'},
    {id:'timelineAsset',name:'timelineAsset',file:'timeline.png'},
    {id:'mediaAsset',name:'mediaAsset',file:'material.png',setting_description:'Description @nextAsset'},
    {id:'nextAsset',name:'nextAsset',file:'next.png',video_shots:{points:[{description:'More @lastAsset'}]}},
    {id:'lastAsset',name:'lastAsset',file:'last.png'},
    {id:'unselectedAsset',name:'unselectedAsset',file:'unselected.png'},
    {id:'unreferenced',name:'unreferenced',file:'unreferenced.png',prompt:'@unselectedAsset'},
);
const allPromptBefore = structuredClone(everyPromptSource);
const allPromptProject = selectedClipProject(everyPromptSource,['a'],'All prompts');
for (const id of ['globalStyle','clipStyle','clipSpeech','draftAsset','intervalAsset','timelineAsset','mediaAsset','nextAsset','lastAsset']) {
    assert(allPromptProject.media.some(row => row.id === id), `${id} is referenced by a retained prompt`);
}
assert(!allPromptProject.media.some(row => ['unselectedAsset','unreferenced'].includes(row.id)));
for (const id of ['globalStyle','clipStyle','clipSpeech','draftAsset','intervalAsset','timelineAsset']) {
    assert(allPromptProject.tracks[0].clips[0].prompt_media_ids.includes(id));
}
assert.deepEqual(everyPromptSource, allPromptBefore);
console.log('All retained prompts: settings, Clip, speech, drafts, keyframe segment, reference timeline and transitive media prompts');

const audioSource = structuredClone(source);
audioSource.tracks[0].type = 'director';
audioSource.tracks[1].type = 'audio';
audioSource.media.push({id:'music',kind:'audio',file:'music.wav'});
audioSource.tracks[0].clips[0].duration_ms = 6000;
audioSource.tracks[1].clips = [
    {id:'music-clip',start_ms:10000,duration_ms:10000,media_ids:['music'],source:{in_ms:2000,out_ms:17000,duration_ms:20000},playback_rate:1.5,volume_points:[{source_ms:6500,gain:0.5}],fade_in_ms:1000,fade_out_ms:1000},
    {id:'outside',start_ms:21000,duration_ms:2000,media_ids:['voice']},
];
audioSource.tracks[0].clips[0].use_audio_track_audio = true;
const audioBefore = structuredClone(audioSource);
const clipAudio = selectedClipProject(audioSource,['a'],'Clip audio');
assert.deepEqual(clipAudio.tracks.map(track => track.id), ['director','audio']);
assert.equal(clipAudio.tracks[1].clips.length,1);
assert.equal(clipAudio.tracks[0].clips[0].start_ms,2000);
assert.deepEqual(clipAudio.tracks[1].clips[0], {...audioSource.tracks[1].clips[0],start_ms:0});
assert(clipAudio.media.some(row => row.id === 'music'));
assert.deepEqual(audioSource,audioBefore);

const keyAudioSource = structuredClone(audioSource);
keyAudioSource.tracks[0].clips[0].use_audio_track_audio = false;
keyAudioSource.tracks[0].clips[0].keyframes = {source_id:'a',points:[
    {time:0,generation:{useAudioTrackAudio:false}},
    {time:1,generation:{useAudioTrackAudio:true}},
    {time:3,generation:{useAudioTrackAudio:false}},
    {time:4,generation:{useAudioTrackAudio:true}},
]};
const keyAudio = selectedClipProject(keyAudioSource,['a'],'Keyframe audio');
assert.equal(keyAudio.tracks[1].clips.length,1,'disjoint enabled keyframes select the same audio Clip once');
assert.deepEqual(keyAudio.tracks[1].clips[0], {...audioSource.tracks[1].clips[0],start_ms:0});
assert.equal(keyAudio.tracks[0].clips[0].start_ms,2000);
assert.equal(selectedClipProject(keyAudioSource,['unused'],'No enabled audio').tracks.some(track => track.id === 'audio'),false);
const boundaryAudioSource = structuredClone(keyAudioSource);
boundaryAudioSource.tracks[1].clips = [
    {id:'overlap',start_ms:14500,duration_ms:6000,media_ids:['music'],source:{in_ms:4000,out_ms:10000},fade_in_ms:500},
    {id:'end-boundary',start_ms:18000,duration_ms:2000,media_ids:['voice']},
    {id:'start-boundary',start_ms:12000,duration_ms:1000,media_ids:['voice']},
];
const boundaryAudio = selectedClipProject(boundaryAudioSource,['a'],'Boundary audio');
assert.deepEqual(boundaryAudio.tracks[1].clips.map(row => row.id),['overlap']);
assert.deepEqual(boundaryAudio.tracks[1].clips[0], {...boundaryAudioSource.tracks[1].clips[0],start_ms:2500});
assert.equal(boundaryAudio.tracks[0].clips[0].start_ms,0);

const trimmedKeyframe = structuredClone(keyAudioSource);
trimmedKeyframe.media.find(row => row.id === 'video').kind = 'video';
trimmedKeyframe.media.find(row => row.id === 'video').video_trim = {source_id:'original',start:4,rate:2};
trimmedKeyframe.tracks[0].clips[0].source = {in_ms:2000};
trimmedKeyframe.tracks[0].clips[0].playback_rate = 1.5;
trimmedKeyframe.tracks[0].clips[0].clip_role = 'video_ref';
delete trimmedKeyframe.tracks[0].clips[0].keyframes;
delete trimmedKeyframe.tracks[0].clips[0].reference_timeline;
trimmedKeyframe.media.find(row => row.id === 'video').video_shots = {source_id:'original',points:[
    {time:11,generation:{useAudioTrackAudio:true}},
    {time:17,generation:{useAudioTrackAudio:false}},
]};
const referenceAudio = selectedClipProject(trimmedKeyframe,['a'],'Reference keyframe audio');
assert.deepEqual(referenceAudio.tracks[1].clips[0], {...audioSource.tracks[1].clips[0],start_ms:0});
console.log('Selected Clip/keyframe audio: entire overlapping Clips, source offset and speed, disjoint intervals, fade, media, reference timeline and inactive selection passed');

const mutedAudioSource = structuredClone(audioSource);
mutedAudioSource.tracks[1].muted = true;
assert.equal(selectedClipProject(mutedAudioSource,['a'],'Muted audio').tracks.some(track => track.id === 'audio'),false);
const selectedAudioSource = structuredClone(audioSource);
const selectedAudio = selectedClipProject(selectedAudioSource,['a','music-clip'],'Explicit audio');
assert.equal(selectedAudio.tracks[1].clips.length,1,'explicitly selected audio stays single');
assert.equal(selectedAudio.tracks[1].clips[0].duration_ms,10000);

editor._buildProject = () => audioSource;
loaded = null;
await create.call(editor);
const copiedAudio = JSON.parse(loaded[0].nodes[0].widgets_values[0]);
assert.equal(copiedAudio.tracks[1].clips[0].source.in_ms,2000);
assert(copiedAudio.media.some(row => row.id === 'music'));
console.log('New workflow snapshot keeps complete audio, while muted and explicitly selected audio follow their track state');
