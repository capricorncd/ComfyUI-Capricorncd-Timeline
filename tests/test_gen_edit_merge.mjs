import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _clearDisabledGenEdit(');
let result = { ok: true, filename: 'merged.mp4', subfolder: 'cap_clip_merges', duration_sec: 8 };
let request, finish;
const api = { async fetchApi(url, options) {
    request = { url, ...JSON.parse(options.body) };
    await new Promise(resolve => { finish = resolve; });
    return { ok: result.ok, status: 500, json: async () => result };
} };
const methods = new Function('api', 'T', 'genVideoUid', 'normalizeGeneratedVideo', 'return ({' +
    source.slice(start, source.indexOf('    _exportGenEditClip(', start)).trim().replace(/\n    async _merge/, ',\n    async _merge') + '});')(
        api, (key, args) => key + (args ? JSON.stringify(args) : ''), () => 'merged-id', row => ({ ...row, enabled: true }));
function fixture() {
    const body = {}, buttons = [{}, {}, {}];
    const st = { clipId: 'parent', selectedId: 'old',
        draft: [{ id: 'old', file: 'old.mp4', enabled: false },
            { id: 'active', file: 'active.mp4', enabled: true, trim_in_sec: 2, trim_out_sec: 6, edit_start_sec: 1, playback_rate: 2, volume: .4 }],
        audioDraft: [{ id: 'a0', enabled: false, file: 'disabled.wav' }, { id: 'a1', enabled: true, muted: true, file: 'muted.wav' },
            { id: 'a2', enabled: false, file: 'disabled-part.wav' }, { id: 'a3', enabled: true, file: 'sound.wav', source_offset: 2, duration: 3, edit_start_sec: 1 }],
        clipMap: new Map([['v0','old'],['v1','active']]), audioMap: new Map([['a0','a0'],['a1','a1'],['a2','a2'],['a3','a3']]),
        timeline: { currentTime: 2, pause(){}, setCurrentTime(time){this.currentTime=time;}, tracks: [
            {visible:false,clips:[{id:'v0'}]}, {visible:true,clips:[{id:'v1'}]},
            {visible:false,clips:[{id:'a0'}]}, {visible:true,muted:true,clips:[{id:'a1'}]},
            {visible:true,clips:[{id:'a2'},{id:'a3'}]},
        ] } };
    return { ...methods, _genEditState: st, genEditModal: { querySelector: () => body, querySelectorAll: () => buttons },
        genEditStatus: {setStatus(text, state){this.text=text;this.state=state;}},
        _pullGenEditDraftFromTimeline(){}, _genEditParentDuration:()=>8,
        _buildProject:()=>({settings:{fps:24,width:1280,height:720},tracks:[{type:'audio',clips:[{file:'unrelated.wav'}]}]}),
        _applyGenEditChanges(){this.saved=true;}, _buildGenEditTimeline(){this.rebuilt=true;},
        _syncGenEditInspector(){}, _scheduleGenEditPreview(){}, body, buttons,
    };
}
for (const tracksOnly of [false,true]) {
    const app=fixture();app._clearDisabledGenEdit(tracksOnly);
    assert.deepEqual(app._genEditState.draft.map(r=>r.id),['active']);
    assert.deepEqual(app._genEditState.audioDraft.map(r=>r.id),tracksOnly?['a1','a2','a3']:['a1','a3']);
    assert.equal(app._genEditState.timeline.currentTime,2);
    assert(app.saved && app.rebuilt);
}
{
    const app=fixture(), before=structuredClone(app._genEditState.draft);
    const pending=app._mergeGenEditVideos();
    assert(app.body.inert && app.buttons.every(b=>b.disabled));
    assert.deepEqual(app._genEditState.draft,before,'retain originals until server success');
    assert.equal(request.project.tracks.length,1,'exclude unrelated project tracks');
    const clip=request.project.tracks[0].clips[0];
    assert.equal(clip.start_ms,0);assert.equal(clip.duration_ms,8000);
    assert.deepEqual(clip.generated_videos,before,'preserve trim, speed, placement and volume');
    assert.deepEqual(clip.gen_edit_audios,app._genEditState.audioDraft);
    assert.deepEqual(request.export_range,{start_frame:0,end_frame:192});
    assert.equal(request.export_video,true);
    finish();await pending;
    assert.equal(app._genEditState.draft[0].file,'cap_clip_merges/merged.mp4');
    assert(app._genEditState.draft[0].enabled);
    assert([...app._genEditState.draft.slice(1),...app._genEditState.audioDraft].every(r=>r.enabled===false));
    assert(!app.body.inert && app.buttons.every(b=>!b.disabled));
    assert.equal(app.genEditStatus.state,'success');
}
{
    const app=fixture(), before=structuredClone(app._genEditState.draft);
    result={ok:false,error:'Missing source video'};
    const pending=app._mergeGenEditVideos();finish();await pending;
    assert.deepEqual(app._genEditState.draft,before);
    assert.equal(app.saved,undefined);
    assert.equal(app.genEditStatus.text,'Missing source video');
    assert.equal(app.genEditStatus.state,'error');
    assert(!app.body.inert && !app._genEditState.merging);
}
console.log('PASS: merge scope, timing, audio, success/failure, disabled clip and track cleanup');
