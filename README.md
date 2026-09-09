# ComfyUI-Capricorncd-Timeline

[简体中文](README.zh.md) · [Editor guide](docs/timeline-editor.md) · [Example workflows](workflows/) · [Release notes](CHANGELOG.md)

<p align="center">
  <img src="./docs/ComfyUI-Capricorncd-Timeline.png" width="160" alt="Capricorncd Timeline" />
</p>

A visual timeline editor for [ComfyUI](https://github.com/comfyanonymous/ComfyUI). Arrange shots, write prompts, generate clips with your connected workflow, then edit and compose the results without leaving ComfyUI.

![Timeline Editor](docs/timeline-editor.jpg)

## Create and refine a video in one place

- **Plan your shots:** organize director, media, audio and subtitle tracks; attach reference images, first/last frames and videos to each Clip.
- **Generate only what needs changing:** run individual clips or enabled clips to the left/right; retain previous generated takes and choose which to use.
- **Manage prompts:** edit Clip prompts and global prepend/append prompts, choose reference inputs, and use a configured Agent or local VL model to optimize the current Clip prompt.
- **Preview before committing:** use a connected preview workflow, adjust the seed, and optionally listen to the timeline audio for the Clip interval.
- **Edit the timeline:** trim, split, box-select and move clips together, swap adjacent clips, and undo/redo. Media clips support opacity, scale and position; subtitles support font, outline, shadow and placement.
- **Shape the sound:** edit volume control points on the waveform. Enabled, unmuted generated-video audio and detached audio mix together in preview and export.
- **Deliver and reuse:** compose an MP4, or export the project, assets and current workflow together as a directory or ZIP.

## Quick start

1. Install the extension and open an [example workflow](workflows/).
2. Open **Timeline Editor**, import media, set the project size and frame rate, then arrange your clips.
3. Add references and Clip prompts. Connect the model-specific generation workflow and run the required clips.
4. Review linked generated videos. Trim takes, mute unwanted audio, and add media overlays or subtitles.
5. Choose **Export → Compose Video**, or export a project package for later editing.

Generation requires the models and nodes used by your chosen workflow. The editor organizes the process; it does not include model weights.

## Export controls

The compose dialog defaults to **project dimensions** and **Maximum quality (H.264 CRF 16)**. CRF 16 is high-quality lossy encoding, not lossless.

- Optional 720P, 1080P and 2K (1440P) presets scale the project proportionally, using the short side as the target.
- High (CRF 18), Standard (CRF 23) and Direct join preferred are also available. Direct joining avoids recompression only for compatible, contiguous video segments and safe cut points; otherwise it falls back to CRF 18 and reports this in the result.
- Audio inclusion is controlled on the timeline through mute/enable settings, not a second export switch.
- A checkbox beside **Watermark** enables or disables text/image watermarks without discarding their settings. **System font** is the first font option.
- A project package contains `project.json`, `workflow.json` and `media/`. Models and plugins are not bundled. On another machine, load the workflow, then import the project package in the editor to relocate media.

See the [full editor guide](docs/timeline-editor.md) for controls, shortcuts, prompt rules and project fields.

## Installation

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/capricorncd/ComfyUI-Capricorncd-Timeline
```

Restart ComfyUI and refresh the browser. Video composition requires **ffmpeg and ffprobe** on the system `PATH`. Model-specific workflows and optional Agent/VL features may require additional models, nodes or configuration.

The interface follows ComfyUI's locale setting: **English / 简体中文 / 日本語**.

## Other nodes

Supporting prompt, image, audio/video and file utilities are listed in the [node documentation index](docs/nodes.md). They remain available without filling the editor homepage with individual node descriptions.

## License

[MIT](LICENSE)
