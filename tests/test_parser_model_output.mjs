import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/cap_data_json_parser.js', import.meta.url), 'utf8');
let extension;
const app = {registerExtension(value) { extension = value; }, loadGraphData(data) { return data; }};
new Function('app', source.replace(/^import .*\r?\n/, ''))(app);
extension.setup();
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

const oldNames = ['audio', 'frame_count', 'first_frame', 'last_frame', 'prompt', 'run_timestamp', 'generate_preview_video', 'from_start', 'from_preview_start', 'seq_filename_prefix', 'images', 'clip_role', 'model_type', 'detailed_description', 'clip_json', 'second_sample', 'output_video', 'save_latent', 'load_context', 'seed'];
const removed = new Set([5, 6, 7, 8, 13]);
for (const objectLinks of [false, true]) {
    const graph = {
        nodes: [
            {id: 1, type: 'CAP_DataJsonClipParser', outputs: oldNames.map((name, i) => ({name, slot_index: i, links: [100 + i]}))},
            {id: 2, type: 'Consumer', inputs: oldNames.map((name, i) => ({name, link: 100 + i}))},
        ],
        links: oldNames.map((_, i) => objectLinks
            ? {id: 100 + i, origin_id: 1, origin_slot: i, target_id: 2, target_slot: i}
            : [100 + i, 1, i, 2, i, 'STRING']),
        outputs: [{linkIds: [105, 114]}],
    };
    const subgraph = structuredClone(graph);
    graph.definitions = {subgraphs: [subgraph]};
    assert.equal(app.loadGraphData(graph), graph);
    for (const current of [graph, subgraph]) {
        assert.deepEqual(current.nodes[0].outputs.map(o => o.name), oldNames.filter((_, i) => !removed.has(i)));
        assert.equal(current.links.length, 15);
        current.links.forEach((link, i) => assert.equal(objectLinks ? link.origin_slot : link[2], i));
        current.nodes[0].outputs.forEach((output, i) => assert.equal(output.slot_index, i));
        current.nodes[1].inputs.forEach((input, i) => assert.equal(input.link, removed.has(i) ? null : 100 + i));
        assert.deepEqual(current.outputs[0].linkIds, [114]);
    }
    const migrated = structuredClone(graph);
    app.loadGraphData(graph);
    assert.deepEqual(graph, migrated);
}

const names = oldNames.filter((_, i) => !removed.has(i));
const types = ['AUDIO', 'INT', 'IMAGE', 'IMAGE', 'STRING', 'STRING', 'IMAGE', 'STRING', 'STRING', 'STRING', 'BOOLEAN', 'STRING', 'BOOLEAN', 'BOOLEAN', 'INT'];
class RestoredNode {
    onConfigure(info) {
        Object.assign(this.outputs, structuredClone(info.outputs));
        return 'restored';
    }
}
extension.beforeRegisterNodeDef(RestoredNode, {name: 'CAP_DataJsonClipParser', output_name: names, output: types});
const restored = new RestoredNode();
restored.outputs = oldNames.map(name => ({name, type: 'STRING'}));
assert.equal(restored.onConfigure({outputs: names.map(name => ({name, type: 'STRING'}))}), 'restored');
assert.equal(restored.outputs.length, 15);
assert.deepEqual(restored.outputs.map(output => output.type), types);

const duplicated = {
    nodes: [{id: 1, type: 'CAP_DataJsonClipParser', outputs: [...names, ...names.slice(10)].map((name, i) => ({name, links: [i + 100]}))}],
    links: Array.from({length: 20}, (_, i) => [i + 100, 1, i, 2, i, 'STRING']),
};
app.loadGraphData(duplicated);
assert.equal(duplicated.nodes[0].outputs.length, 15);
assert.equal(duplicated.links.length, 20);
assert.deepEqual(duplicated.links.slice(15).map(link => link[2]), [10, 11, 12, 13, 14]);
assert.deepEqual(duplicated.nodes[0].outputs[14].links, [114, 119]);
const repaired = structuredClone(duplicated);
app.loadGraphData(duplicated);
assert.deepEqual(duplicated, repaired);
console.log('Parser outputs: removed ports disconnected, retained links remapped, nested graphs and repeated loads preserved');
