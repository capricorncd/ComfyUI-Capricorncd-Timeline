import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const colorHelpers = source.slice(source.indexOf('function parseSubtitleColor('), source.indexOf('function defaultSubtitleMeta('));
const { parseSubtitleColor, subtitleColorWithOpacity } = new Function(`${colorHelpers}; return {parseSubtitleColor, subtitleColorWithOpacity};`)();
function method(name) {
    const start = source.indexOf(`    ${name}(`);
    const end = source.indexOf('\n    }', start) + 6;
    return new Function('parseSubtitleColor', 'subtitleColorWithOpacity', `return ({${source.slice(start, end)}}).${name}`)(parseSubtitleColor, subtitleColorWithOpacity);
}
assert.deepEqual(parseSubtitleColor('#123456'), {hex:'#123456', alpha:1});
assert.deepEqual(parseSubtitleColor('rgba(17, 34, 51, 0.25)'), {hex:'#112233', alpha:.25});
assert.deepEqual(parseSubtitleColor('#11223300'), {hex:'#112233', alpha:0});
assert.deepEqual(parseSubtitleColor('rgba(0,0,0,0)'), {hex:'#000000', alpha:0});
assert.equal(subtitleColorWithOpacity('#112233', 25), 'rgba(17,34,51,0.25)');
assert.equal(subtitleColorWithOpacity('#112233', 0), 'rgba(17,34,51,0)');

const input = (value='') => ({value, nextElementSibling:{textContent:''}});
const app = {
    subScaleInput:input(100), subScaleValue:{}, _fillSubtitlePosition(){},
    subStrokeColorInput:input(), subShadowColorInput:input(),
    subStrokeOpacityInput:input(), subShadowOpacityInput:input(),
    subStrokeCb:{checked:true}, subShadowCb:{checked:true},
    subOpacityInput:input(), subOpacityVal:{},
};
const original = {text:'Test', strokeColor:'rgba(17,34,51,0.25)', shadowColor:'rgba(80,90,100,0)', opacity:0};
method('_fillSubtitlePanel').call(app, original);
assert.equal(app.subStrokeColorInput.value, '#112233');
assert.equal(app.subStrokeOpacityInput.value, '25');
assert.equal(app.subShadowOpacityInput.value, '0');
assert.equal(app.subOpacityInput.value, '0');
const read = method('_readSubtitlePanelInto').call(app, {...original});
assert.equal(read.strokeColor, original.strokeColor);
assert.equal(read.shadowColor, original.shadowColor);
assert.equal(read.opacity, 0);
app.subShadowColorInput.value = '#aabbcc';
app.subShadowOpacityInput.value = '60';
assert.equal(method('_readSubtitlePanelInto').call(app, read).shadowColor, 'rgba(170,187,204,0.6)');
assert.equal(app.subShadowOpacityInput.nextElementSibling.textContent, '60%');

// Existing style fields carry RGBA through project save/load without new schema fields.
const styles = source.slice(source.indexOf('function defaultSubtitleMeta('), source.indexOf('\nfunction ', source.indexOf('function serializeSubtitleStyle(') + 10));
const { serializeSubtitleStyle, subtitleStyleFromJson } = new Function(`${styles}; return {serializeSubtitleStyle, subtitleStyleFromJson};`)();
const restored = subtitleStyleFromJson(JSON.parse(JSON.stringify(serializeSubtitleStyle(read))));
assert.equal(restored.strokeColor, read.strokeColor);
assert.equal(restored.shadowColor, read.shadowColor);

const ctx = {save(){}, restore(){}};
method('_paintSubtitle').call({_w:()=>({value:480}), _drawTextWithLetterSpacing(){}}, ctx, 864, 480,
    {...read, strokeEnabled:true, strokeWidth:3, shadowEnabled:true});
assert.equal(ctx.strokeStyle, read.strokeColor);
assert.equal(ctx.shadowColor, read.shadowColor);
assert.equal(ctx.globalAlpha, 0, 'zero overall opacity must not become opaque');
console.log('Subtitle RGBA tests passed');
