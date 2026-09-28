# H3 音频修复节点

[全部节点](nodes.md) · [返回主页](../../README.zh.md)

分类：`Capricorncd/MiniMaxH3`。时间轴主流程使用配置节点；两个 latent 修复节点供自定义采样流程选择，不必在自动修复之后重复叠加。

## H3 Audio Refine Config

节点 ID：`CAP_H3AudioRefineConfig`。连接 `audio_refine_config → MiniMax H3 Video Generator.audio_refine_config`。参数：`enabled` 默认 true，`steps` 默认 3，`audio_denoise` 默认 0.5，`cache_mode` 可选 off/auto/ram/vram，默认 off。未连接或禁用时跳过修复，缓存 off 仅关闭缓存。无声输出、预览候选和数字人片段跳过此修复。依赖见[生成器说明](h3-video-generator.md#音频修复配置)。

## H3 加速音频修复

节点 ID：`CAP_H3FastAudioRefineSampler`。输入 H3 `model`、`positive`、`negative`、采样后的音视频 `latent` 和种子。默认 3 步、CFG 1、Euler/simple、`audio_denoise=0.5`、`preview=false`。输出 `latent` 接音视频 latent 分离与解码。冻结视频流，只重采样音频；可自定义采样器参数，不自动安装冻结视频缓存，可输入外部已应用缓存的模型。

## 音频修复（加速）

节点 ID：`CAP_H3FastAudioRepair`。输入 H3 `model`、`positive`、采样后音视频 `latent`、种子、步数（3）及修复强度（0.5）。内部配置 Kitchen attention、H3 视频/音频 sigma shift（12/3）、CFG 1 和 Euler/simple，输出修复后的 `latent`。缓存默认 auto，视频 latent 时间长度超过 40 时自动关闭缓存；其他非 off 缓存模式依赖 ComfyUI-H3-AudioRefine 的 `H3FrozenVideoCache`。

两个修复节点都要求完整 H3 音视频 latent，不能输入纯视频张量。强度 1 重新生成音频，较低值保留更多原音频。自定义流程将输出分离、解码后，把图像与音频接入 Seq To Video。
