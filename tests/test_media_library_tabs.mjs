import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/CapTimelineEditorApp.js',import.meta.url),'utf8');
function method(name){
    const start=source.indexOf(`    ${name}(`);
    return new Function('return ({'+source.slice(start,source.indexOf('\n    }',start)+6)+'}).'+name)();
}
const app={_mediaTab:'all',_imgFiles:['hero.png'],_videoFiles:['action.mp4'],_audioFiles:['voice.wav']};
app._matchesMediaTab=method('_matchesMediaTab');
app._filterMediaFiles=(files,kind)=>app._matchesMediaTab(kind) ? files : [];
const visible=method('_visibleMediaEntries');
assert.deepEqual(visible.call(app).map(row=>row.kind),['image','video','audio']);
for(const kind of ['image','video','audio']){
    app._mediaTab=kind;
    assert.deepEqual(visible.call(app).map(row=>row.kind),[kind]);
}
assert(source.includes('this._mediaTab = "all"'));
assert(source.includes('this._mediaTab !== "all" && lastKind'));
console.log('Media library tabs: default All and separate image/video/audio filtering passed');
