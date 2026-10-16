import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createProjectIdentity, projectIdentity} from '../js/editor/ProjectIdentity.js';
const identity = createProjectIdentity();
assert.match(identity.id, /^\d{8}-[a-f0-9]{8}$/);
assert.notEqual(identity.id, createProjectIdentity().id);
assert.deepEqual(projectIdentity({...identity, name:'renamed', tracks:[]}), identity);
const source=readFileSync(new URL('../js/CapTimelineEditorApp.js',import.meta.url),'utf8');
const start=source.indexOf('    _clipSpecifiedVideoPath(');
const makePath=new Function(`return ({${source.slice(start,source.indexOf('\n    }',start)+6)}})._clipSpecifiedVideoPath`)();
const editor={_projectIdentity:identity,projectNameInput:{value:'old'},_makeGenVideoStamp:()=> '20261016-100000'};
const path=makePath.call(editor,'clip-1');
editor.projectNameInput.value='renamed';
assert.equal(makePath.call(editor,'clip-1'),path);
assert.equal(path,`CapTimelineEditor/${identity.id}/20261016-100000_clip-1_kf0.mp4`);
console.log('PASS: unique identity, preserved fields and rename-independent output path');

// An older running backend returns plain text, not JSON, for this new route.
const readStart = source.indexOf('    async _readProjectIdentityResponse(');
const readResponse = new Function('T', 'projectIdentity', `return ({${source.slice(readStart, source.indexOf('\n    }', readStart) + 6)}})._readProjectIdentityResponse`)((key, args) => `${key}:${args?.status || ''}`, projectIdentity);
for (const status of [404, 405]) {
    await assert.rejects(readResponse(new Response(`${status}: Not Found`, {status})), /project_identity_restart_required/);
}
await assert.rejects(readResponse(new Response('Internal Server Error', {status: 500})), /project_identity_request_failed:500/);
await assert.rejects(readResponse(new Response('{}')), /project_identity_invalid_response/);
await assert.rejects(readResponse(new Response('<html>fallback</html>')), /project_identity_invalid_response/);
assert.deepEqual(await readResponse(new Response(JSON.stringify(identity))), identity);
const ensureStart = source.indexOf('    async _ensureProjectIdentityForWidgets(');
const widget = {value: JSON.stringify({name: 'Original', tracks: [{id: 'keep-me'}]})};
const original = widget.value;
const ensureIdentity = new Function('api', 'app', 'projectIdentity', `return ({${source.slice(ensureStart, source.indexOf('\n    }', ensureStart) + 6)}})._ensureProjectIdentityForWidgets`)(
    {fetchApi: async () => new Response('405: Method Not Allowed', {status: 405})}, {}, projectIdentity);
await assert.rejects(ensureIdentity.call({
    _w: () => widget,
    _parseProjectWidgetValue: () => ({project: JSON.parse(widget.value)}),
    _readProjectIdentityResponse: readResponse,
    _writeProjectJson: () => assert.fail('Must not overwrite a project after a failed request'),
}), /project_identity_restart_required/);
assert.equal(widget.value, original);
console.log('PASS: unavailable backend, invalid responses and original project preservation');
