# MiniMax H3 视频生成

分类：`Capricorncd/MiniMaxH3`。将现有条件编码、循环采样、二采放大、音频修复和保存流程封装，减少画布节点，不另写模型实现。

新增「面部修复」，默认关闭。连接 [H3 面部修复配置](h3-face-refine.md) 设置检测模型和修复强度；调用 Carasibana 的 H3-FaceRefine，在运动去模糊之后修复。可直接使用 `models/yolo` 或 `models/ultralytics/bbox` 中已有的人脸检测模型。

「采样模型」连接外部已加载 LoRA 的 MODEL，另接文本编码器 CLIP、视频 VAE、音频 VAE 和时间轴 `data_json`。节点内已删除 LoRA 名称和强度，改由外部加载器选择；切换 4/8 步不会更换 LoRA。「基础模型」始终可选：连接时用于音频修复和基础采样日程；未连接时，两者均复用输入的 LoRA 采样模型，不剥离其 LoRA。视频/音频 shift 固定为 12/3，Euler、simple 日程、CFG 1。旧工作流请使用更新后的精简示例，或重建此节点并重新连接，不要沿用旧版按位置保存的控件值。

- 单采：按 `data_json` 的工程宽高跑完整的 4/8 步，忽略「一采百万像素」。宽高必须为 32 的倍数。
- 片段输出路径和文件名仅取自运行数据 `data_json.clips[].output_video`，已移除备用文件名前缀。缺失或空路径会在任何片段开始采样前报错；H3 Context 文件名标记仍按原规则写入。最终合成仍独立保存到 `output/capricorncd-timeline/compose/`。
- 二采：按一采百万像素执行完整的 4/8 步，将 denoised latent 放大至工程尺寸，再使用独立的二采 Sigmas。「一采执行步数」已删除，不再截取前半段日程。4/8 步选项不控制二采 Sigmas 的长度；最终尺寸仍来自 `data_json`。
- 每个 Clip 的 -1 种子只随机一次，一采、二采及音频修复共用，并写入视频元数据，附 Clip ID、模型及采样参数。
- 逐 Clip 解码并保存，只累积视频文件路径，不保留整条时间轴的图像张量。但单个长片段或高清片段仍可能超出显存。
- 时间轴「运行全部」连接本节点时，一次提交整批 Clip，不再逐 Clip 拆成独立任务。节点内部逐段生成并立即通知关联，整个 `data_json.clips` 完成后才合成一次。运行选中、左侧或右侧多个 Clip 时同样整批提交，范围仅包含本次请求的 Clip；旧式逐片段工作流不受影响。
- 每完成一个 Clip，节点底部立即切换到该视频并循环播放。点击视频暂停/继续；悬停出声，移出静音。下一片段完成后自动播放新片段，节点结束不会重置同一视频的暂停状态。
- 预览上方显示 `Clip 当前序号 / 总数 · 百分比 · 当前阶段`，包括准备、采样、可选放大/二采/音频修复、解码、保存及最终合成。百分比按已完成的处理阶段统计，不是采样步数或耗时估算；关闭动态预览仍显示进度，全部输出成功后才显示 100%。
- 「合成最终视频」默认开启：全部片段完成后复用「多段视频合成」，按 Context 替换及首尾裁剪规则拼接本次生成的视频，保留其原声，并播放合成结果。保存到 `output/capricorncd-timeline/compose/`，新增的 `composed_video` 单值输出给出相对 output 的文件路径。关闭时该输出为空，底部保留最后一个 Clip。此处只拼接生成片段；需要渲染字幕、媒体和 BGM 轨道时，仍使用编辑器的合成视频弹窗。
- Save Latent 连续片段需按时间轴顺序一起运行。按 `previous_source_clip_id` 匹配低清/高清 Context，不读取目录中任意“最新文件”。Context 保存在 `output/h3_context/cap_generator/<本次运行>/`。缺少前段会报错；暂不支持从旧运行自动恢复部分链。
- 保留原始视频的 Context 与补齐帧。输出的单个 `data_json` 保留起止时间和裁剪规则，更新文件名及拼接来源，可接「多段视频合成」；`video_files` 是相对于 output 的 STRING 文件名列表，不是 VIDEO 对象或帧张量。

## 运动去模糊（实验）

`motion_deblur` 默认关闭。开启时需要安装 **ComfyUI-MAINodes**，并连接不含加速 LoRA 的「基础模型」；缺少依赖或基础模型会在采样前报错。关闭时不依赖 MAINodes，也不增加采样步骤。

修复在一采/可选二采和音频修复完成后执行：运动分析 → 拉长帧段 → VAE 编码 → 基础模型部分重采样 → 按实际 hold map 恢复原帧数。独立使用 25 步 simple 日程的后 12 步（inject 0.5、Euler、CFG 1、shift 12/3），与现有 4/8 步和二采 Sigmas 分开。采用上游自适应参数 q=0.75、d_max=4、ramp=true、bridge=8；这些组合仍需按实际镜头评估，不保证消除所有模糊，也可能改变动作或背景。

- 至少需要 22 帧。额外的拉长帧段、编码和采样会增加内存、显存及时间；此开关未自动启用 MAINodes 的实验性低显存补丁或分窗口处理。
- 输出沿用原帧数、FPS、时间轴裁剪规则和原音轨。有声模式通过 `H3AudioSmear` 将原音频拉长后编码，作为修复采样的音频初始值；最终仍使用修复前的音轨，不输出重新生成的声音。无声模式跳过音频拉伸和编码。口型与动作效果仍需实际观看确认。
- Context 前缀不拉长，修复后恢复为修复前的原帧；严格首尾帧同样保留修复前的端点画面。不会把它升级为参考图逐像素一致保证。
- Save Latent 改为编码修复后的画面；二采时低清 Context 由修复后的工程尺寸画面缩小再编码，高清 Context 按工程尺寸编码，音频 latent 沿用原视频采样结果。额外 VAE 往返可能引入颜色或细节变化。
- 进度显示「运动去模糊（MAINodes）」，视频元数据记录开关、内部节点及参数。更新后旧工作流保持默认关闭。

### 来源与致谢

运动分析、帧段拉伸、音视频初始化、截取采样日程和恢复算法来自 **MatlowAI / MATLOWAI** 的 [ComfyUI-MAINodes](https://github.com/matlowai/ComfyUI-MAINodes)，Copyright © 2026 MATLOWAI，采用 [GPL-3.0-or-later](https://github.com/matlowai/ComfyUI-MAINodes/blob/f4868b4a08e8a504ce86db54a17961d399ffa2bc/LICENSE)。接口核对版本：`f4868b4a08e8a504ce86db54a17961d399ffa2bc`。

本节点通过已注册接口调用 `H3JerkOracle`、`H3TimeSmear`、`H3AudioSmear`、`H3V2VInit`、`H3InjectSchedule` 和 `H3ExactRecover`；不复制或改名发布原算法。Cap 的工作是开关、流程编排、时间轴/Context 适配和输出管理。参考上游 [motion.py](https://github.com/matlowai/ComfyUI-MAINodes/blob/f4868b4a08e8a504ce86db54a17961d399ffa2bc/motion.py) 与 [TUNING.md](https://github.com/matlowai/ComfyUI-MAINodes/blob/f4868b4a08e8a504ce86db54a17961d399ffa2bc/TUNING.md)；原作者实测不代表本接入已完成 GPU 画质验证。原节点包保留自己的版权和许可证。

## MV 与音频开关

- 「生成视频音频」默认开启，保持原有行为；关闭时，片段视频和最终合成均不写入音轨，并跳过音频修复采样、音频 VAE 解码和响度归一化。
- 「修复音频」沿用 `audio_refine`，默认关闭；只有「生成视频音频」开启时才生效。MV 已有背景音乐时，可直接关闭「生成视频音频」，无需再逐项关闭修复和响度处理。
- 当前 H3 核心仍进行音视频联合采样，这个开关不会移除音频 latent、修改声音提示词或删除音频参考，不能省掉联合采样中的全部音频计算。保留 AV latent 也避免破坏二采和 Save Latent 连续性。音频 VAE 仍需连接，供已有音频参考条件使用。
- 无声模式不要求安装音频修复或响度处理插件。预览、进度和视频拼接照常工作；进度不包含被跳过的音频修复阶段。

## 严格首尾帧

默认关闭：保持现有多图、视频、音频参考或纯文本生成。即使使用 FL 模型和加速 LoRA，也不会自动切换为首尾帧约束。

开启：走原生 `MiniMaxH3ImageToVideo` 关键帧条件。1 张启用图片作为首帧，2 张按素材顺序作为首帧、尾帧。空素材、超过 2 张图片、视频/音频参考或 Motion Context 会明确报错。需要自行选用适配的 FL 模型和 LoRA。这是模型条件约束，不保证输出端点逐像素一致；二采时会在最终尺寸重新编码首尾帧。

原有 **Cap MiniMaxH3** 条件节点也新增了同一选项，默认关闭，保留原接口与输出。

## 按功能需要的依赖

- 二采：`Comfyui_Minimax_h3_latent_Upscaler`，放大模型放在 `models/latent_upscale_models`，使用目前含时间分块选项的接口。
- Save Latent / Motion Context：`ComfyUI-H3-Motion-Context`。
- 音频修复：`ComfyUI-H3-AudioRefine`，冻结视频 int4 缓存 + 音频单独采样，默认 3 步、denoise 0.5；缓存可能增加内存/显存压力，可关闭。
- -14 LUFS 响度归一化：`ComfyUI-WanVideoWrapper` 的 `NormalizeAudioLoudness`。
- 采样动态预览已内置，默认开启，需要 KJNodes，但不修改其代码。预览使用外部已加载 LoRA 的采样模型，不再外接预览覆盖节点或连接 preview_frames。内部按当前 Clip 实际准备的帧数（含 Context 和补齐）预览一采、二采；底部先显示采样动图，保存完成后切换为视频。旧 Clip 延迟到达的预览不会覆盖新 Clip 或已完成的视频；音频单独修复不触发内置视频预览。
- 「预览 Tiny VAE」可选择 `models/vae_approx` 中已有的 `taeh3.safetensors`；`none` 使用近似颜色。采样预览并非最终画质，完成视频仍使用完整视频 VAE 解码。关闭「采样动态预览」后，不依赖 KJNodes。

不会自动下载模型或依赖。更新后重启 ComfyUI 并刷新前端。CPU/模拟接口测试不代表已经完成真实 GPU 生成验证。
