import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
class FixedDate extends Date {
    constructor() { super(2026, 8, 11, 14, 35, 20); }
}
function method(name, fetch = null) {
    let start = source.indexOf(`    ${name}(`);
    if (start < 0) start = source.indexOf(`    async ${name}(`);
    assert(start >= 0);
    const end = source.indexOf('\n    }', start) + 6;
    return new Function('T', 'Date', 'fetch', 'api', `return ({${source.slice(start, end)}}).${name}`)(
        key => key, FixedDate, fetch, {apiURL: path => path});
}
function fixture() {
    const app = {
        composeModal:{}, _composeDone:true, _composeBusy:false,
        composePrefixInput:{value:'cap_timeline_compose/'},
        composeFilenameInput:{value:'Custom_20260911_130000.mp4'},
        composeResolutionSelect:{value:'project'}, composeQualitySelect:{value:'maximum'},
        composeRunBtn:{textContent:'open_folder_btn',disabled:false},
        _watermark:{enabled:true,text:{content:'Test'},image:{file:'logo.png'},opacity:50},
        _lastComposeOutput:{filename:'old.mp4'},
        _safeProjectFilename:()=> 'Project',
        _setComposeStatus(text){this.status=text;}, _saveToWidgets(){}, _buildProject:()=>({tracks:[]}),
    };
    for (const name of ['_composeExportSettings','_composeDefaultFilename','_onComposeSettingsChange']) app[name]=method(name);
    app._composeSubmittedSettings=JSON.parse(JSON.stringify(app._composeExportSettings()));
    return app;
}
{
    const app=fixture();
    app._onComposeSettingsChange();
    assert.equal(app._composeDone,true,'unchanged settings keep Open Folder');
    assert.equal(app.composeFilenameInput.value,'Custom_20260911_130000.mp4');
    assert.equal(app._composeDefaultFilename(),'Project_20260911_143520.mp4');
    assert.equal(app._composeDefaultFilename('My video.mp4'),'My video_20260911_143520.mp4');
}
for (const edit of [
    a=>{a.composeResolutionSelect.value='1080p';},
    a=>{a.composeQualitySelect.value='high';},
    a=>{a.composePrefixInput.value='another/';},
    a=>{a._watermark.enabled=false;},
    a=>{a._watermark.text.content='New';},
    a=>{a._watermark.opacity=0;},
    a=>{a._watermark.image.file='';},
    a=>{a._watermark.image.file='new.png';},
    a=>{a._watermark.position='top-left';},
]) {
    const app=fixture();
    edit(app);
    app._onComposeSettingsChange();
    assert.equal(app._composeDone,false);
    assert.equal(app._lastComposeOutput,null);
    assert.equal(app.composeRunBtn.textContent,'compose_start_btn');
    assert.equal(app.composeFilenameInput.value,'Custom_20260911_143520.mp4');
    assert.equal(app.status,'');
}
{
    const app=fixture();
    app.composeFilenameInput.value='Manually renamed.mp4';
    app._onComposeSettingsChange();
    assert.equal(app.composeFilenameInput.value,'Manually renamed.mp4','do not overwrite user filename edits');
    assert.equal(app._composeDone,false);
}
{
    const app=fixture();
    app._composeDone=false;
    let finish, payload;
    const run=method('_runComposeVideoExport', async (url, options)=>{
        payload=JSON.parse(options.body);
        return new Promise(resolve=>{finish=()=>resolve({ok:true,json:async()=>({filename:payload.filename})});});
    });
    const pending=run.call(app);
    assert.equal(app._composeBusy,true);
    app._watermark.opacity=80;
    app._onComposeSettingsChange();
    assert.equal(app.composeRunBtn.disabled,true,'do not allow simultaneous exports');
    assert.equal(payload.watermark.opacity,50,'in-flight request uses submitted settings');
    finish(); await pending;
    assert.equal(app._composeDone,false,'edits during export still invalidate the result');
    assert.equal(app.composeRunBtn.textContent,'compose_start_btn');
    assert.equal(app.composeRunBtn.disabled,false);
    assert.equal(app.composeFilenameInput.value,'Custom_20260911_143520.mp4');
    const success=method('_runComposeVideoExport',async()=>({ok:true,json:async()=>({filename:'new.mp4'})}));
    await success.call(app);
    assert.equal(app._composeDone,true,'can export again without closing the modal');
    assert.equal(app.composeRunBtn.textContent,'open_folder_btn');
}
assert.match(source,/composeModal\?\.addEventListener\(event, \(\) => this\._onComposeSettingsChange\(\)\)/);
for (const name of ['_onWatermarkImagePicked','_removeWatermarkImageNow']) {
    assert.match(method(name).toString(), /this\._onComposeSettingsChange\(\)/, 'async watermark changes invalidate export');
}
console.log('Compose settings: parameter edits, timestamp, custom names, async edits and repeat export passed');
