# Cap Model Preview Override

[Node index](nodes.md) · [中文](zh/model-preview-override.md)

Sampling previews for normal workflows, subgraphs and repeated for-loop execution. The node displays the latest preview image or animation; Timeline Editor's **Run and Preview** also recognizes it.

## Dependency and reason for this node

Requires **ComfyUI-KJNodes** with `ModelPreviewOverrideKJ`. This is a runtime adapter, not a bundled copy of KJNodes: decoding and sampling previews still use its engine. No KJNodes files are modified.

In the KJNodes implementation this adapter targets, preview events use the executing node's raw ID. For-loop expansion creates temporary IDs that its frontend cannot resolve to the original node, so later iterations can stop updating the preview. This adapter resolves ComfyUI's display ID before attaching the preview wrapper, including qualified subgraph IDs. Its own preview widget receives those events.

The original node remains usable in ordinary workflows. Locally patching it is unsuitable for shared workflows: updates can overwrite the patch, and recipients do not receive that fix.

## Usage

1. Install Timeline and KJNodes, restart ComfyUI and refresh the browser.
2. Replace **Model Preview Override** with **Cap Model Preview Override** (`CAP_ModelPreviewOverride`). Keep the same MODEL, VAE and frame-count connections and copy its settings. Do not chain both preview overrides on the same MODEL path.
3. Connect the output MODEL to the sampler's model/guider path. In two-pass workflows, both passes need to consume an overridden MODEL to provide previews.
4. Set `preview_frames` above 1 for animation when supported by the model/decoder. `preview_fps` controls preview playback only. Select a compatible decoder from `models/vae_approx` through `tiny_vae`, or retain the original VAE configuration. This node does not download decoders.
5. Run normally, or use **Prompt Manager → Run and Preview**. Each loop iteration updates the same preview window; the final saved video still comes from the workflow's output node.

The wrapper does not change model weights, seeds, sampling settings or generated duration. Preview decoding still has a cost; larger previews and more frames can slow sampling. Its compact widget shows previews and step progress, not the original node's full statistics UI.

When sharing a workflow, list **ComfyUI-Capricorncd-Timeline + ComfyUI-KJNodes** as dependencies. No customized KJNodes installation is needed.
