import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/cap_data_json_parser.js', import.meta.url), 'utf8');
let extension;
new Function('app', source.replace(/^import .*\r?\n/, ''))({registerExtension(value) { extension = value; }});
class Node {
    onConfigure(info) { this.configured = info; return 'preserved'; }
}
extension.beforeRegisterNodeDef(Node, {name: 'CAP_DataJsonClipParser'});
for (const oldName of ['agent', 'model']) for (const label of ['Agent', 'エージェント', 'Model', '模型', 'モデル', 'My custom model label']) {
    const node = new Node();
    node.outputs = Array.from({length: 20}, (_, i) => ({name: `slot${i}`, type: 'STRING', links: [i + 100]}));
    node.outputs[12].name = oldName; node.outputs[12].label = label;
    const before = structuredClone(node.outputs);
    assert.equal(node.onConfigure('old workflow'), 'preserved');
    assert.equal(node.configured, 'old workflow');
    assert.equal(node.outputs[12].name, 'model_type');
    assert.equal(node.outputs[12].label, label === 'My custom model label' ? label : undefined);
    assert.deepEqual(node.outputs[12].links, before[12].links);
    assert.deepEqual(node.outputs.filter((_, i) => i !== 12), before.filter((_, i) => i !== 12));
}
class Other {}
extension.beforeRegisterNodeDef(Other, {name: 'UnrelatedNode'});
assert.equal(Other.prototype.onConfigure, undefined);
console.log('Parser output rename: old workflows retain slots, links and custom labels');
