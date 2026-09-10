# MiniMaxH3

## 一镜到底的 Context 拼接

同轨相邻上一段启用 `save_latent` 时，下一段未设置 Context（0）优先使用 22 帧；正数优先按指定值对齐 H3 网格。以补齐后的原始帧数计算 `替换起点 = 上一段 raw_frames - context_frames`，起点必须位于上一段可见源区间 `[context_frames + head_frames, raw_frames - tail_frames)` 内。首尾延展和补齐尾帧也计入判断；优先值不合适时选择距离最近的合法 `17k+5` 帧数，例如 5 或 39。若无合法值则提示调整时长或延展，不越界裁剪、不移动分镜边界。最终采用值写入 `h3_motion_context_length` 和 `h3_timing.context_frames`，原请求值记录为 `h3_timing.requested_context_frames`。

下一段重新生成的 Context 用于替换上一段末尾，而不是在完整上一段之后重复追加。设上一段目标 X 帧、补齐尾帧 n、Context 为 C，下一段目标 Y 帧：上一段保留原视频前 `X+n-C` 帧，再接下一视频的前 `C-n` 帧；下一段按 `Y+C-n` 补齐生成，并从源偏移 `C-n` 开始保留 Y 帧。下一段新增尾帧 m 继续向后传递，最后一段裁掉 m，总长保持 X+Y。若存在首部延展，还需加上快照中的 `head_frames`。

新快照为 `h3_timing.version=2`，`context_frames` 是模型使用的完整 C，`context_carry_frames` 是上一段尾帧 n，不能把两者混淆。新文件名使用 `__h3v2_..._s0_n4.mp4` 等形式记录 n；旧 `h3v1` 文件仍按原规则读取。请重新输出 data_json 并生成新视频，不要对原始视频预先裁掉完整 C 帧，否则会丢失需要保留的 n 帧。

`data_json.clips[].playback_spans` 按帧保存来源 Clip、`output_video`、`start_frame`（从0开始）和 `frame_count`。Compose Clip Videos 使用这些区间；自动／手动关联原始视频后，前端也保存跨 Clip 尾部引用供播放和工程合成使用。必须保留原始视频的 Context；已裁掉 Context 的文件不能提供替换画面。

**分类：** `Capricorncd`

从 Timeline Editor 的单个片段调用 ComfyUI 内置 **MiniMax H3 Reference to Video**。片段媒体映射为 H3 参考槽；帧数与提示词来自该片段。

支持两种输入：

- `data_json` + `index`，或
- **`clip_json`**（来自 [Data Json Clip Parser](data-json-clip-parser.md)）— 当 `clip_json` 非空时，**忽略 `data_json` 与 `index`**

---

## 工作原理

1. 解析片段：优先使用 `clip_json`；否则从 `data_json` 按 `index` 取片段  
2. 收集视觉参考（`images` + `videos`，或回退到 `start_image` / `end_image`）与 `audios[]`  
3. 映射到 H3 参考（见下表上限），并组装提示词  
4. 用 CLIP、VAE、Audio VAE、`width` / `height` 与对齐后的帧数调用 `MiniMaxH3ReferenceToVideo`  
5. 同时输出堆叠后的静帧、视频帧与混合音频  

| 类型 | H3 槽位 | 上限 | 说明 |
|------|---------|------|------|
| 图片 | `ref_image_1…` | 9 | 静帧参考 |
| 视频 | `ref_video_1…`（音轨 → `ref_video_audio_n`） | 3 | 重采样到 24 fps，最长 15 秒，不足 5 帧会垫齐 |
| 音频 | `ref_audio_1…` | 3 | 来自片段 `audios[]`；末端可能略延长以对齐 H3 帧数 |

`clip_json` 为自包含格式：`images` / `videos` 条目已带绝对 `file` 路径（并可内嵌 `materials`）。

---

## 提示词

Timeline Editor 的提示词按固定顺序拼接：启用的 `prepend_prompt` → 启用的素材描述 → 启用的 Clip 提示词 → 启用的 `append_prompt`。MiniMax H3 工程中，`clip.prompt` 统一保存带标题的 `subject_definitions`、`summary`、`retention_analysis` 与 `detailed_description`，形成一个完整结构化提示词。

提示词管理器的 MiniMaxH3 Skill 库同时支持 [MiniMax 官方 Skills](https://github.com/MiniMax-AI/MiniMax-H3/tree/main/skills) 与原社区 Skill。官方 Skill 优先显示；选择 `h3-prompt-writing` 时会连同 `references/base-en.txt`、`references/ref-en.txt` 一起注入，以覆盖 T2VA、I2VA、FL2VA、L2VA 与 Ref2VA 的官方格式。Style Skill 有 `SKILL.cn.md` 时，中文界面优先使用中文版本。

---

## 输入参数

| 名称 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `clip` | CLIP | — | H3 文本编码器 |
| `vae` | VAE | — | 图像 / 视频 VAE |
| `audio_vae` | VAE | — | 音频 VAE |
| `width` | INT | 1344 | 生成宽度 |
| `height` | INT | 768 | 生成高度 |
| `ref_image_size` | `match` / `max` | `match` | `match` 按生成像素面积缩放参考图；`max` 短边 2048 |
| `data_json` | STRING | — | Timeline Editor 运行时 JSON（有 `clip_json` 时忽略） |
| `index` | INT | 0 | 从 0 开始的片段索引（有 `clip_json` 时忽略） |
| `clip_json` | STRING | — | 可选。自包含片段 JSON；非空时覆盖 `data_json` / `index` |

## 输出参数

| 名称 | 类型 | 说明 |
|------|------|------|
| `positive` | CONDITIONING | H3 正向 conditioning |
| `latent` | LATENT | 供采样的 H3 latent |
| `total_frame_count` | INT | 按 **clip_json / data_json 的 fps**（时间轴帧率）对齐到 H3 的 17k+5 网格后的总帧数。例如 7s @ 60fps → 约 430 |
| `prompt` | STRING | 实际送入 H3 的提示词 |
| `images` | IMAGE | 堆叠静帧参考（letterbox）；无则为 64×64 空白 |
| `videos` | IMAGE | 堆叠视频参考帧（letterbox）；无则为空白 |
| `audio` | AUDIO | 片段混合音频（主轨裁剪或 `audios[]`） |
| `seed` | INT | 读取 `clip_json` 或 `data_json[index]` 的 Clip 种子；追加在 `save_latent` 后。缺失或无效时返回 `-1`（未设置）。 |

将 `positive` / `latent` 接到与官方 Reference to Video 相同的 MiniMax H3 采样 / 解码链路即可。
将 `seed` 接到 `RandomNoise.noise_seed` 或采样器的种子输入。采样前请设置非负 Clip 种子，或先生成预览以保存种子。分辨率或采样参数不同时，仅使用相同种子不能复现预览画面。

---

## 典型工作流

```
Timeline Editor
  └── data_json ──► Data Json Clip Parser（index = 循环计数）
                         └── clip_json ──► MiniMaxH3
  └── width / height ──► MiniMaxH3
                             ├── positive、latent ──► H3 采样 / 解码 ──► 保存 / Seq To Video
                             └── prompt、images、videos、audio ──► 可选检查 / 旁路
```

若不需要解析器其它输出，也可直接把 `data_json` + `index` 接到 MiniMaxH3。

`data_json` 已排除禁用 / 隐藏片段，选择性重跑仍沿用时间轴的禁用 / 启用流程。

## 连续片段的生成与播放时长

时间轴运行前检查同轨、相邻的 H3 Save Latent → Context 续接组。需要调整时，确认框列出调整前后的起止时间；确认后保留中间片段全部有效帧，移动组内边界，并调整最后一个 context 片段，保持整组原始起止时间和总时长不变。取消不修改、不入队。不变速、不再要求整秒，不移动音频、字幕等其他轨道或后续分镜。调整可能涉及同组未选中的 Clip，可撤销；轨道锁定、首尾扩展非零或最后一段剩余时长不足时阻止调整。

设置 Save Latent / Motion Context 的 H3 片段会在 `data_json.clips[].h3_timing` 中保存原始帧数、实际 context、首尾扩展与末段尾裁剪、有效帧数和播放位置。先规划整组，再按运行选择过滤，避免逐 Clip 入队丢失前段 context。单独重跑续接片段时必须提供对应的前段 latent；改动时间后建议重新生成整组，组内首段 context 为 0。

每个相邻边界比较向前、向后移动到合法 H3 帧数的改动量，选择较小者；可缩短也可延长，并为后续片段预留最小时长。最后一段吸收差额，保持组内总时长不变。缩短是在生成前修改目标长度，不是生成后裁掉中间片段的续接尾帧。

例：24fps、三个 5 秒 Clip，前两段 Save Latent 开启、后两段 context=39。确认后边界为 0 / 124 / 243 / 360 帧，即约 0 / 5.167 / 10.125 / 15 秒；生成 124 / 158 / 158 原始帧，去掉 context 并裁剪末段尾部 2 帧后，有效帧数为 124 / 119 / 117，总长仍为 15 秒。重复运行不会再次改变边界。

指定视频文件名增加类似 `__h3v1_c39_r175_h0_t0_f24000_s1` 的后缀，记录实际 context、原始帧数、首尾裁剪帧、帧率×1000 和 Save Latent。自动或手动关联均依据该后缀及文件实长识别原始视频 / 已裁掉 context 的视频，不读取后来改动的 Clip context 设置，也不重复裁剪。旧文件名仍可关联，但缺少生成快照时不猜测自动裁剪。

视频关联仍只处理视频内部裁剪，不自动改动分镜；时间边界仅在运行确认后修改。调整时间不会重新生成已有关联视频。旧工程 `h3_layout` 的一次性修复保持不变，新确认的调整不写入该旧字段。

一镜到底请勿额外裁掉相接位置的首尾扩展帧。使用 H3 Motion Context Trim 时，图像和音频都接入该节点，再保存；未使用 Trim 保存的原始视频也可识别。规划了续接但缺少可用的前段 latent/视频，或插件返回的裁剪帧数与规划不符时会报错，不再悄悄生成一段无关联的视频。独立的 H3 Timeline Sequence 节点继续使用自己的分段规划。
