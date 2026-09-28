# 连续片段采样与内部辅助节点

[全部节点](nodes.md) · [返回主页](../../README.zh.md)

主节点分类：`Capricorncd/MiniMaxH3`，辅助节点位于 `Internal`。时间轴常规流程使用 [H3 视频生成](h3-video-generator.md)；本组适合需要显式 SAMPLER、SIGMAS 以及解码图像/音频输出的自定义流程。

## Timeline Sequence Sampler

节点 ID：`CAP_H3TimelineSequenceSampler`。

输入时间轴 `data_json`、H3 `model`、`clip`、`vae`、`audio_vae`、`SAMPLER` 和 `SIGMAS`；设置宽高、种子及参考图尺寸。`max_segment_seconds` 默认 10（5–15），较长区间拆分生成；`drift_strength` 默认 0.35，`continue_audio` 默认 true。

连接 `images → Seq To Video.images`、`audio → Seq To Video.audio`，保存节点 fps 与时间轴一致。`sequence_info` 为分段计划，可接 Show Anything。`last_segment_latent (continuation only)` 仅表示最后一个分段，解码它不能获得整条视频。本节点不保存视频；启用续接需安装 H3 Motion Context。

## H3 Sequence Continuation

节点 ID：`CAP_H3SequenceContinuation`。输入 `model`、当前 `latent`、`previous_latent`、`sigmas`、`context_frames`（39）、`drift_strength`（0.35）、`continue_audio`（true）；输出经过处理的 `model` 和 `latent` 接下段采样。它复制前段音视频 Context，并应用随采样变化的降噪遮罩。相邻 latent 的批次与空间尺寸须匹配。

## H3 Sequence Trim Video

节点 ID：`CAP_H3SequenceTrimVideo`。输入解码 `images`、`trim_frames`（0）、`keep_frames`（124）；去掉 Context 前缀，保留指定帧数，输出 IMAGE 批次用于拼接或保存。

## H3 Sequence Trim Audio

节点 ID：`CAP_H3SequenceTrimAudio`，未设置单独显示名称。输入解码 `audio`、`trim_frames`（0）、`keep_frames`（124），按 H3 的 24 fps 时间基准裁剪，输出 AUDIO。

## H3 Sequence Audio Join

节点 ID：`CAP_H3SequenceAudioJoin`。输入累计 `audio1`、下一段 `audio2`、`overlap_frames`（0）、`keep_frames`（124），输出 AUDIO。重叠为 0 时直接拼接，否则进行等功率交叉淡化。采样率和批次须一致；单声道可扩展为另一输入的声道数。帧数按 H3 的 24 fps 换算。

Internal 节点由连续采样器自动构建，首页两个核心节点的流程无需手动连接它们。
