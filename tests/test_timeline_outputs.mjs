import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/cap_timeline_editor.js', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('function migrateTimelineOutputs('), source.indexOf('function configuredNamedValues('));
const migrate = new Function(`const NODE_CLASS = 'CAP_TimelineEditor'; ${body}; return migrateTimelineOutputs;`)();
const names = ['fps', 'width', 'height', 'prepend_prompt', 'data_json', 'clips_length', 'total_frame_count', 'clips_audio', 'frame_seq_dir'];
function fixture(objects = false) {
    const links = names.map((name, i) => [10 + i, 1, i, 2, i, 'STRING']);
    return {
        nodes: [
            { id: 1, type: 'CAP_TimelineEditor', widgets_values: ['unchanged prompt'], outputs: names.map((name, i) => ({ name, slot_index: i, links: [10 + i] })) },
            { id: 2, inputs: names.map((name, i) => ({ name, link: 10 + i })) },
        ],
        links: objects ? links.map(([id, origin_id, origin_slot, target_id, target_slot, type]) => ({ id, origin_id, origin_slot, target_id, target_slot, type })) : links,
        outputs: [{ linkIds: [13, 14] }],
    };
}
for (const objects of [false, true]) {
    const graph = fixture(objects);
    graph.definitions = { subgraphs: [fixture(true)] };
    migrate(graph);
    for (const g of [graph, ...graph.definitions.subgraphs]) {
        assert.deepEqual(g.nodes[0].outputs.map(o => o.name), names.filter(n => n !== 'prepend_prompt'));
        assert.deepEqual(g.nodes[0].outputs.map(o => o.slot_index), [0, 1, 2, 3, 4, 5, 6, 7]);
        assert.equal(g.nodes[1].inputs[3].link, null);
        assert.equal(g.nodes[1].inputs[4].link, 14);
        assert.deepEqual(g.outputs[0].linkIds, [14]);
        assert.deepEqual(g.nodes[0].widgets_values, ['unchanged prompt']);
        assert.equal(g.links.length, 8);
        g.links.forEach((link, i) => assert.equal(Array.isArray(link) ? link[2] : link.origin_slot, i));
    }
    const snapshot = structuredClone(graph);
    migrate(graph);
    assert.deepEqual(graph, snapshot, 'migration is idempotent');
}
const unrelated = fixture();
unrelated.nodes[0].type = 'AnotherNode';
const unchanged = structuredClone(unrelated);
migrate(unrelated);
assert.deepEqual(unrelated, unchanged);
migrate(null);

const bundled = JSON.parse(readFileSync(new URL('../workflows/CapTimeline_MiniMaxH3_v1_SingleSampling.json', import.meta.url), 'utf8'));
const timeline = bundled.nodes.find(n => n.type === 'CAP_TimelineEditor');
const dataLink = timeline.outputs.find(o => o.name === 'data_json').links[0];
migrate(bundled);
assert.equal(timeline.outputs[3].name, 'data_json');
assert.equal(bundled.links.find(l => l[0] === dataLink)[2], 3);
assert.match(source, /migrateTimelineOutputs\(data\);[\s\S]*return orig.call\(this, data, \.\.\.rest\)/);
console.log('Timeline output migration passed (legacy, subgraphs, current and bundled workflows).');
