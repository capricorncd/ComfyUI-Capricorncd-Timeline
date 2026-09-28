# H3 audio repair nodes

[All nodes](nodes.md) · [README](../README.md)

Category: `Capricorncd/MiniMaxH3`. For the main timeline workflow, use the config node. The two latent repair nodes are alternatives for custom sampling graphs, not additional stages to stack onto automatic repair.

## H3 Audio Refine Config

Node ID: `CAP_H3AudioRefineConfig`. Connect `audio_refine_config → MiniMax H3 Video Generator.audio_refine_config`. Inputs: `enabled` (true), `steps` (3), `audio_denoise` (0.5), `cache_mode` (`off`, `auto`, `ram`, `vram`; default `off`). Disconnected or disabled skips repair; cache off skips only caching. Silent output, preview candidates and Digital Human Clips skip this repair. See [generator dependencies](h3-video-generator.md#audio-repair-configuration).

## H3 加速音频修复

Node ID: `CAP_H3FastAudioRefineSampler`. Connect H3 `model`, `positive`, `negative`, sampled packed AV `latent`, and seed. Defaults: 3 steps, CFG 1, Euler/simple, `audio_denoise=0.5`, `preview=false`. Output `latent` feeds AV separation and video/audio decoding. The video stream is frozen while audio is resampled. This node exposes sampler controls and does not install a frozen-video cache itself; an externally patched cache model is optional.

## 音频修复（加速）

Node ID: `CAP_H3FastAudioRepair`. Connect H3 `model`, `positive`, sampled AV `latent`, seed, steps (3) and audio denoise (0.5). It sets Kitchen attention, H3 video/audio sigma shifts (12/3), CFG 1 and Euler/simple, then outputs repaired `latent`. `cache_mode` defaults to `auto`; auto disables caching when video latent temporal length exceeds 40. Cache modes other than off require `H3FrozenVideoCache` from ComfyUI-H3-AudioRefine.

Both latent repair nodes require a packed H3 video+audio latent, not a video-only tensor. Repair strength 1 regenerates audio; lower strength retains more of the sampled audio. Decode the returned AV latent and connect the resulting images/audio to Seq To Video in a custom graph.
