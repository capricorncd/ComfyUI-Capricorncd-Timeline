import { app } from "../../scripts/app.js";

const REMOVED_OUTPUTS = new Set(["run_timestamp", "generate_preview_video", "from_start", "from_preview_start", "detailed_description"]);

function migrateParserOutputs(graph) {
    if (!graph) return;
    const slotMaps = new Map();
    const removedLinks = new Set();
    for (const node of graph.nodes || []) {
        if (node.type !== "CAP_DataJsonClipParser") continue;
        const slots = new Map();
        const namedSlots = new Map();
        const outputs = [];
        node.outputs = (node.outputs || []).filter((output, index) => {
            if (REMOVED_OUTPUTS.has(output.name)) {
                for (const id of output.links || []) removedLinks.add(id);
                return false;
            }
            const name = ["agent", "model"].includes(output.name) ? "model_type" : output.name;
            if (namedSlots.has(name)) {
                const slot = namedSlots.get(name);
                slots.set(index, slot);
                outputs[slot].links = [...new Set([...(outputs[slot].links || []), ...(output.links || [])])];
                return false;
            }
            const slot = outputs.length;
            namedSlots.set(name, slot);
            slots.set(index, slot);
            outputs.push(output);
            if (output.slot_index != null) output.slot_index = slot;
            return true;
        });
        slotMaps.set(String(node.id), slots);
    }
    graph.links = (graph.links || []).filter(link => {
        const array = Array.isArray(link);
        const id = array ? link[0] : link.id;
        const slots = slotMaps.get(String(array ? link[1] : link.origin_id));
        const slot = array ? link[2] : link.origin_slot;
        if (slots && !slots.has(slot)) removedLinks.add(id);
        if (removedLinks.has(id)) return false;
        if (slots) {
            if (array) link[2] = slots.get(slot);
            else link.origin_slot = slots.get(slot);
        }
        return true;
    });
    for (const node of graph.nodes || []) {
        for (const input of node.inputs || []) {
            if (removedLinks.has(input.link)) input.link = null;
        }
    }
    for (const output of graph.outputs || []) {
        if (output.linkIds) output.linkIds = output.linkIds.filter(id => !removedLinks.has(id));
    }
    for (const subgraph of graph.definitions?.subgraphs || []) migrateParserOutputs(subgraph);
}

app.registerExtension({
    name: "Capricorncd.DataJsonClipParser",
    setup() {
        const loadGraphData = app.loadGraphData;
        app.loadGraphData = function (graphData, ...args) {
            migrateParserOutputs(graphData);
            return loadGraphData.call(this, graphData, ...args);
        };
    },
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "CAP_DataJsonClipParser") return;
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = onConfigure?.apply(this, arguments);
            const configuredOutputs = arguments[0]?.outputs;
            // LiteGraph merges saved output arrays without removing constructor slots.
            if (configuredOutputs && this.outputs.length > configuredOutputs.length) {
                this.outputs.length = configuredOutputs.length;
            }
            for (const output of this.outputs || []) {
                const name = ["agent", "model"].includes(output.name) ? "model_type" : output.name;
                const slot = nodeData.output_name?.indexOf(name) ?? -1;
                if (slot >= 0) output.type = nodeData.output[slot];
            }
            const output = this.outputs?.find(output => output.name === "agent" || output.name === "model");
            if (output?.name === "agent" || output?.name === "model") {
                output.name = "model_type";
                if (["agent", "Agent", "エージェント", "model", "Model", "模型", "モデル"].includes(output.label)) delete output.label;
            }
            return result;
        };
    },
});
