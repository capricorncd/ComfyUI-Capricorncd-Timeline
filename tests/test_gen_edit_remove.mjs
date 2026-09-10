import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
  const start = source.indexOf('    ' + name + '(');
  const end = source.indexOf('\n    }', start) + 6;
  assert(start >= 0);
  return new Function('T', 'iconHtml', 'ICONS',
    'return ({' + source.slice(start,end) + '}).' + name)(
    key=>key, name=>name, {});
}
class Element {
  constructor() { this.handlers={}; this.children=[]; this.classList={toggle(){}}; }
  replaceChildren() { this.children=[]; }
  append(...children) { this.children.push(...children); }
  addEventListener(name,fn) { this.handlers[name]=fn; }
}
globalThis.document={createElement:()=>new Element()};
const track={
  locked:false, visible:true, muted:false, actionsEl:new Element(),headerEl:new Element(),
  setLocked(value){this.locked=value;},
};
const clip={id:'ui1',name:'video.mp4',track};
track.clips=[clip];
const app={
  _genEditState:{clipMap:new Map([['ui1','gen1']]),draft:[{id:'gen1'},{id:'gen2'}],audioDraft:[],selectedId:'gen1'},
  _deleteGenEditClip:method('_deleteGenEditClip'),
  _removeGenEditClip:method('_removeGenEditClip'),
  _openDeleteConfirm(message,fn){this.message=message;this.confirm=fn;},
  _buildCtxMenu(items){this.menu=items;},
  _applyGenEditChanges(){this.saved=true;}, _buildGenEditTimeline(){this.rebuilt=true;},
  _syncGenEditInspector(){}, _scheduleGenEditPreview(){},
  _closeGenEditModal(){this.closed=true;},
};
method('_setupGenEditTrackControls').call(app,track,'gen1');
assert.equal(track.actionsEl.children.length,4);
const event={preventDefault(){},stopPropagation(){}};
const remove=track.actionsEl.children[3];
remove.handlers.click(event);
assert.equal(app.message,'confirm_remove_from_clip');
assert.equal(app._genEditState.draft.length,2); // Wait for confirmation.
track.actionsEl.children[0].handlers.click(event);
assert.equal(remove.disabled,true);
app.confirm();
assert.equal(app._genEditState.draft.length,2); // Lock also guards pending confirmations.
track.actionsEl.children[0].handlers.click(event);
track.headerEl.handlers.contextmenu(event);
app.menu[0].fn();
app.confirm();
assert.deepEqual(app._genEditState.draft,[{id:'gen2'}]);
assert(app.saved && app.rebuilt);
app._genEditState.clipMap.set('ui1','gen2');
app._removeGenEditClip(clip,'gen2');
assert(app.closed);
let menuVisible = true;
const closeApp = {
  _overlay: { querySelector: () => menuVisible ? { remove() { menuVisible = false; } } : null },
  _fontPicker: { close: () => false },
  _removeCtxMenu: method('_removeCtxMenu'),
  _destroyGenEditTimeline() { assert.equal(menuVisible, false, 'remove stale actions before destroying their timeline'); },
  _genEditState: {},
  _timeline: { _keyboardSuspended: true },
  genEditModal: { hidden: false },
  _scheduleProgramPreview() {},
};
method('_closeGenEditModal').call(closeApp);
assert.equal(menuVisible, false);
assert.equal(closeApp.genEditModal.hidden, true);
assert.equal(closeApp._genEditState, null);
assert.equal(closeApp._timeline._keyboardSuspended, false);
method('_closeGenEditModal').call(closeApp); // Closing again without a menu remains safe.
console.log('Gen-edit track unlink: button, context menu, confirmation, lock and last-row removal passed');
