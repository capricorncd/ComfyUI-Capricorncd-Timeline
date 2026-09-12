# Timeline Editor（时间轴编辑器）

**分类：** `Capricorncd`

本插件的核心编辑器，支持在 ComfyUI 中**一键出片、局部修改、独立项目管理与项目资源导入导出**。通过已连接的生成工作流制作完整视频，再按需调整并重新生成单个片段，保留其他生成结果。在全屏多轨时间轴上组织图像、视频和音频，设置图像关键帧与分片段提示词，通过工作流重新生成指定片段，再预览生成结果并与音频合成。

Timeline Editor 保存**按轨道嵌套的 `project_json`**，并输出精简的运行时 `data_json`（每个视觉片段带 `audios[]` 切片）。

从节点启动器打开全屏编辑器；编辑内容会写回节点的 `project_json` 控件。

---


## 编辑器界面

### 素材库（左侧）

- 标签：**图像** / **视频** / **音频**
- 列出已上传到 ComfyUI `input/capricorncd-timeline/` 的文件
- 刷新可重新扫描上传目录
- 拖到时间轴，或右键插入；右键也可 **替换素材**（选文件 → 预览 → 确认替换，时间轴引用同步更新）
- 素材星级与星级筛选
- 点击预览弹窗查看素材
- 预览弹窗底部提供**替换素材**（选择同类型文件 → 预览 → 确认；更新工程中的引用，不删除原文件）、**插入到当前Clip**（图片/视频追加到选中的未锁定导演或媒体 Clip，支持多选及一次撤销）和**插入到当前位置**（在播放头创建 Clip，支持音频）。
- 通过「添加素材」上传图片 / 视频 / 音频（写入 `input`，不依赖资源目录）

### 预览 / 时间轴（中间）

- 合成视频的导出画质默认为最高画质（H.264 CRF 16，仍为有损编码），也可选择高画质（18）、标准（23）或优先直接拼接。直接拼接要求连续片段的尺寸、帧率及编码参数兼容，且切点可安全复制；混音、字幕、水印、叠加、尺寸变化或不兼容切点会改用 CRF 18 精确合成，并在完成提示中说明。分辨率默认使用项目设置。
- **节目预览**：时间轴上方监视器，按节点 `width` × `height` 比例显示当前播放头画面（主轨 + 副轨叠层；图片 cover；有尾帧时在片段中间最多 1s 交叉过渡；视频按裁剪入点取样）；底部分隔条可拖动调整高度
- 多条视觉轨与音频轨；工具栏菜单可添加轨道
- **更多 → 新建项目**：确认后恢复为未命名工程、默认空轨道，无素材或 Clip，清空全局提示词，恢复默认尺寸/帧率，播放头回到零。需要保留旧工程时请先导出；撤销记录会清空，但不会删除磁盘文件或 AI 服务配置。生成、预览或导出进行中暂不可用。
- 单轨：锁定、可见性、静音（音频）。锁定轨道的 Clip 不可通过点击、Ctrl/Meta 多选、框选或右键菜单选中；锁定时取消该轨道已有选中项，保留其他未锁定轨道的选中项，解锁后不自动恢复选中。
- 拖动 / 缩放片段；`Ctrl+点击` 多选
- 音频轨片段：双击波形中轴音量线添加控制点，拖动调节音量（中轴 100%，范围 0–200%），水平虚线可吸附本片段其他点的音量；选中点后按 Delete 删除。点间线性过渡，可直接制作淡入淡出；旧工程的淡入淡出载入时转为控制点。曲线叠加片段音量，应用于试听、Agent 音频、混音和导出；支持撤销，裁剪和分割保持源内位置。
- 选中任意非字幕 Clip，可将 **Clip 音量**设为 0–200%；工程保存为 `volume`（`1.0` = 100%），编辑器播放、发给 Agent 的音频混合、`clips_audio` 与「合成视频」都会应用
- 音频轨音频、媒体轨单视频 Clip 支持 **播放速度** 0.25–4×（默认1×）。保留起点及源内裁剪范围，时长随速度变化；与其他 Clip 重叠时不执行。波形、音量点、预览与合成同步变速，音高随速度变化。工程可选字段 `playback_rate` 缺省为1；`source` 始终记录原素材的时间。导演轨与图片不提供此项。
- 导演 Clip 使用生成视频预览时，所有已启用且未静音的生成视频原声与独立音频一起混合播放，不受画面层级遮挡影响；生成视频编辑弹窗采用相同规则。只想听一条时，请将其他条目静音或禁用。
- 可在播放头插入 Package / 素材
- 工具栏 **生成预览 / 素材预览**（在「插入 Clip」旁）：一键切换所有已绑定生成视频的 Clip 为生成视频预览或素材预览
- 工具栏 **还原 / 重做**（编辑器内历史）
- 缩放：`Ctrl+滚轮`；平移：`Alt+滚轮`

### 检视面板（右侧）

- 选中片段缩略图（适用时含首 / 尾帧）
- 每片段可选择“Clip 提示词”和“素材描述”提示词部分
- **生成视频**列表（有绑定时）：启用、静音（图标与轨道静音相同）、打开预览、删除（需确认）
- 快捷键提示

### 项目栏

- 每个视频以独立的时间轴项目组织，分别管理项目名称、片段与素材引用
- 可编辑项目名称
- **导入** / **导出**：
  - 目录包与 ZIP（含全部素材 + Clip 关联的生成视频写入 `media/generated/` + `project.json` + 当前工作流快照 `workflow.json`）。工作流保存节点、连线及参数，不包含模型与插件；迁移到其他机器后先加载工作流，再从编辑器导入工程包以重新定位素材。
  - **保存目录**可选：填写已存在的本地绝对路径时，由 ComfyUI 后端保存（需 localhost 访问），创建带时间的文件夹或 ZIP，成功后提供**打开文件夹**；目录不存在则报错，不自动创建。留空时，文件和 ZIP 均弹出保存目录选择窗口，不依赖下载列表，保存后按钮仍为**导出**；ZIP 写入完成并核对文件大小后才提示成功。可取消包含工作流或生成视频。弹窗可拖动、每次打开居中；修改选项后恢复**导出**。状态区边框、背景和颜色与合成视频一致：处理中白色、成功绿色、失败或素材缺失红色。
  - **合成视频**：弹窗设置 `filename_prefix`（默认 `cap_timeline_compose/`）和文件名 `项目名称_yyyyMMdd_hhmmss.mp4`。音频是否参与合成完全由时间轴上的静音、禁用状态决定，导出弹窗不再另设音频排除开关。ffmpeg 写入 ComfyUI `output/`。需要本机 **ffmpeg**。
- 标题栏显示 `时间轴编辑器 | 项目名称`；点击项目名称可聚焦右侧栏名称输入（并取消 clip 选中）。节点宽高与帧率显示在右侧（标题栏右侧 + 项目面板）。
- 工程级“前置提示词”和“后置提示词”可在编辑器右侧栏或“提示词管理”弹窗 Tab 中维护。
- 关闭后返回 ComfyUI 画布

### Clip 右键菜单（视觉轨）

- 运行、AI 优化提示词、禁用 / 禁用其他、设置标题、查看素材、添加生成的视频
- 导演 Clip 可选择**清除关联视频**：确认后仅清除该 Clip 的全部视频关联（含禁用的关联），不删除文件、不改变起止时间；支持 Ctrl+Z 撤销，锁定轨道不可操作。
- 处于**生成视频预览**模式时：对当前生成视频提供 **静音 / 取消静音**
- 媒体轨视频右键的**静音 / 取消静音**立即影响时间轴播放，并保存到工程、用于合成导出；支持撤销。静音的视频 Clip 右下角显示静音图标，取消静音后隐藏。
- 复制 / 粘贴；**删除**为红色

### AI 优化提示词

左侧最后的**完整提示词** Tab 只读显示用于生成的最终拼接文本：启用的全局前置 → 启用的素材描述 → Clip 提示词 → 启用的全局后置。随「使用提示词」选项更新，去除 `#` 注释行，不回写到 Clip 提示词。

富文本提示词框中，未选中文本时 **Ctrl+C** 复制光标所在整行；粘贴这种整行内容且没有选区时，插入到当前行下方。选中文字复制或从其他应用复制的普通文本，粘贴到光标位置；有选区时始终替换选区。按实际换行分行，不按视觉折行；普通文本 Prompt Skill 输入框不受影响。

- 弹窗左侧提供“Clip 提示词”“全局前置提示词”“全局后置提示词”三个可编辑 Tab；AI 生成仍只写入 Clip 提示词。
- “素材描述”Tab 上方固定 16:9 预览，下方只读显示选中素材的描述。与 Clip 设置共用右上角“100% 宽度预览 / 素材列表”切换：列表内可上下拖动排序、启用/禁用、移除关联，排序后保持原素材选中。完整预览右下角可删除当前关联；从素材库拖图片/视频到任一预览窗口，会像拖到 Clip 一样追加到末尾并选中。移除支持时间轴撤销，不删除源文件；锁定轨道只能浏览。单纯切换查看不改变提示词拼接或发送给 Agent 的勾选项。
- 弹窗右侧提供“AI 优化”和“视频预览”两个 Tab；预览工作流的导入、清除、Clip 种子、预览分辨率（MP）与载入状态均在“视频预览”Tab 中设置，不再放在编辑器“设置”窗口。点击底部“预览”会先自动切换到“视频预览”，再启动预览工作流。
- AI 生成只写入当前 `clip.prompt`；工程级前置、后置提示词只有在对应 Tab 或工程面板中手动编辑时才会变化。
- 完整素材预览中，删除图标左侧的眼睛可禁用当前素材。禁用素材不再出现在预览切换和计数中，但仍保留在列表模式，可从列表重新启用；全部禁用时会提示切换到列表恢复。支持撤销，锁定轨道不可修改。
- 素材描述下方的“插入到 Clip 提示词”按 [H3 官方 Ref2VA 规范](https://github.com/MiniMax-AI/MiniMax-H3/blob/main/skills/h3-prompt-writing/references/ref-en.txt)的主体/来源关系插入 `- <Subject N> 来自 <Picture n>。【素材描述】。`，来源说明与描述分句，保留描述原文，不调用 AI 改写或翻译。Subject 使用已有非注释标签最大编号的下一号；Picture 按启用图片的顺序编号。条目插入第一个非注释 `subject_definitions:` 行的下一行，没有该标题时放到首行，随后切换到 Clip 提示词页。无描述、禁用、非图片素材和锁定轨道不可插入；支持撤销。
- “提供给大模型”可分别控制：当前 Clip 提示词、素材描述、图片/首尾帧数据、视频参考数据、时间轴背景音频数据，以及当前 Clip 最新一条已启用的上一版生成视频。上一版生成视频默认不发送；启用后，Agent 将其作为待诊断的生成结果，对照提示词和参考素材修正画面、动作、镜头与一致性问题。素材中保存的图片生成提示词不会发送给 Clip 提示词 Agent。
- “目标提示词格式”决定 Clip 视频模型所需的返回格式；“生成模式”用于区分 MiniMax H3 多图参考、首尾帧、文生视频、视频参考/编辑等模式，也用于生成 LTX 等模型所需的相应格式。
- “模型”选择实际执行请求的已配置 Agent（例如 ChatGPT、Gemini）或本地 Qwen3-VL；目标视频模型与执行提示词优化的模型相互独立。
- 本地 Qwen3-VL 不接收音频数据；勾选音频数据时需选择支持音频输入的已配置 Agent。音频用途可设为自动判断、按背景音频表演、口型同步或不使用。发送前会截取所有与当前 Clip 重叠、已启用且未静音的音频轨片段，应用源内偏移、时间轴位置和淡入淡出，混合成一条与当前 Clip 等长的 WAV。
- Prompt Skill 仅在目标 Agent 为 MiniMaxH3 时启用。Skill 库同时加载 MiniMax 官方与社区来源，官方排在前面；点击“更新”会同步两者。应用 Skill 时会把主 `SKILL.md`、中文版本（如有）及 `references/` 中的文本完整加入 Agent 指令。
- 弹窗默认使用**当前工作流**：队列空闲时显示“运行与预览”，保持弹窗打开并切换到视频预览 Tab；有运行或排队任务时显示“加入运行队列”，不抢占预览。点击时会重新检查队列。
- 在采样器的 MODEL 输入路径中连接 KJNodes **Model Preview Override**，即可接收初始噪声与逐步采样预览；`preview_frames > 1` 时可输出动图（取决于模型/解码器支持）。不更换模型、种子、尺寸或采样参数，不强制改为 0.2MP，也不修改第三方节点。它是真实生成任务，仍会保存视频并关联 Clip；未连接预览节点时只显示最后保存的视频。
- “中止本次任务”会中止生成，而不只是暂停播放器；只操作已核对归属的本次任务。中间画面通过本地 HTTP 内存缓存显示，不写入工程素材；完成后显示保存的视频。“视频预览”标题旁的 **i** 提供使用说明。
- 原有独立预览保留在“独立预览工作流（可选）”折叠区，其**预览**按钮仍运行导入的 API 格式工作流，需包含**生成时间轴预览**（`CAP_TimelinePreview`）节点。以下低分辨率设置仅适用于该独立模式。
- `user/default/workflows/CapTimeLinePreview_v1.json` 同时保存可视化工作流和内嵌 `output` API 图，可直接在“视频预览”Tab 中导入。宽高保持为 `0` 时，节点会保留工程原始宽高比，并等比缩小到设定的预览百万像素（默认 `0.2`，尺寸按 16 对齐）。
- 只需给该节点连接 MiniMax H3 模型、CLIP、视频 VAE 和音频 VAE；编辑器会自动注入当前 `project_json`、Clip ID 及 Clip 已保存的种子。工作流内置的 Model Preview Override 会在每个采样步骤推送新画面，从早期噪点逐步显示到最终清晰结果。
- 预览使用 WebSocket 接收初始噪声及逐步图片，通过本地 HTTP 地址显示；采样结束后保留最后一张图片，直到最终视频首帧可播放再切换。中间图是近似 latent 预览。运行时固定 `preview_frames=1`，不修改保存的工作流；中间图仅作短期内存缓存，结束时清理，不写入工程素材。
- 节点内部完成 Clip 定位、参考素材和时间轴音频解析、最终提示词拼接、采样、解码，并返回内存 `VIDEO`、画面帧、音频、最终提示词、实际种子和 Clip ID；是否保存视频由下游自行决定。

---

## 生成视频

可为视觉 clip 绑定 ComfyUI `output/` 下的 MP4（右键 **添加生成的视频**，或运行后自动附加）。

| 控件 | 行为 |
|------|------|
| 启用 | 参与预览 / 合成选用 |
| 静音 | 时间轴播放与合成视频时不使用该文件音轨（默认关闭 = 播放声音） |
| clip 上预览徽章 | 在素材预览与生成视频预览间切换 |
| 删除 | 确认后仅解除 clip 绑定（不删磁盘文件） |

合成视频按已保存的子轨顺序叠加所有启用的生成视频，使用各视频的时间偏移和裁剪区间，并限制在父 Clip 范围内。所有启用且未静音的视频音轨（包括画面被覆盖的层）与独立音频一起混音。

在“修剪视频”中，可通过视频轨道的删除按钮或标题右键菜单解除关联；锁定轨道不能删除。确认框明确提示不会删除磁盘文件，移除最后一条视频后关闭修剪弹窗。

分离出的每条音频独占一条轨道，可独立静音、调整音量曲线或删除。已有重叠音频重新打开弹窗后也会自动分轨，不改变起止时间和源音频偏移。

## 合成导出设置

- 弹窗最大为 80vw × 80vh，设置内容可滚动。
- 分辨率默认“项目设置尺寸”；720P、1080P、2K（1440P）分别以 720、1080、1440 像素为短边，按项目宽高比等比缩放，编码尺寸取偶数。字幕和水印随画布缩放。
- 画质默认“最高画质（H.264 CRF 16）”，仍为有损编码；可选高画质（18）、标准（23）及优先直接拼接。标题旁的 ⓘ 悬停显示说明。
- 直接拼接要求编码兼容、片段连续且切点可安全复制；混音、叠加、缩放或不兼容切点会改用 CRF 18。完成提示显示实际使用了直接拼接还是重新编码。
- 所有音频是否参与合成，均在时间轴上通过静音、启用状态控制。
- “水印”前的复选框默认勾选；关闭后预览和导出均不添加文字/图片水印，保留原设置。字体列表首项为“系统字体”，已有的明确字体选择保持不变。

---

## 片段禁用 / 启用

只重跑某一段，不必重建整条时间轴。

| 快捷键 | 操作 |
|--------|------|
| `Ctrl+B` | 禁用 / 启用选中片段 |
| `Ctrl+G` | 禁用其他所有片段（切换） |

批量运行跳过禁用或隐藏的导演片段及轨道；静音音频不作为参考音频输出。手动运行单个导演 Clip（右键运行或提示词管理中的运行）时，即使 Clip 或其轨道已禁用/隐藏，仍将该 Clip 数据传给下游，不修改工程中的禁用状态。其他禁用片段仍会跳过。

---

## 键盘快捷键

| 按键 | 操作 |
|------|------|
| `Ctrl+点击` | 多选片段 |
| `Delete` / `Backspace` | 删除选中（需确认） |
| `Ctrl+B` | 禁用 / 启用选中片段 |
| `Ctrl+G` | 禁用 / 启用其他片段 |
| `Ctrl+滚轮` | 缩放时间轴 |
| `Alt+滚轮` | 左右滚动时间轴 |

---

## 输入参数

| 名称 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `fps` | FLOAT | 24.0 | 帧率 |
| `width` | INT | 1344 | 输出宽度（写入 `data_json`） |
| `height` | INT | 768 | 输出高度（写入 `data_json`） |
| `swap_wh` | BOOLEAN | false | 切换时交换当前 width / height（如 1280×720 → 720×1280） |
| `project_version` | STRING | 包版本 | 写入项目 / 运行时 JSON |
| `project_json` | STRING | 空项目 | 完整可编辑时间轴文档（轨道、片段、资源、设置） |
| `trim_offset` | INT | 1 | 预留给音频尾部流程；`data_json` 中的运行时时间不会因此延长 |

## 输出参数

| 名称 | 类型 | 说明 |
|------|------|------|
| `fps` | FLOAT | 帧率 |
| `width` | INT | 视频宽度 |
| `height` | INT | 视频高度 |
| `data_json` | STRING | 仅含启用且可见片段的运行时 JSON（见下文） |
| `clips_length` | INT | 运行时片段数量 |
| `total_frame_count` | INT | 按 `fps` 汇总的总帧数 |
| `clips_audio` | AUDIO | 整条时间轴上未静音音频（及带音视频）的混音 |
| `frame_seq_dir` | STRING | 序列帧临时目录（`output/temp/capricorncd-frame-sequences`），首次运行创建，之后每次运行前清空 |

已删除独立的 `prepend_prompt` 输出；工程设置及 `data_json.prepend_prompt` 保持不变。加载旧版界面工作流时，自动调整其余输出连线，断开已删除输出的连线。旧 API 工作流请先在更新后的界面中重新导出再运行。

---

## `project_json`（可编辑）

编辑器保存到节点控件的**完整工程文档**。当前文档形状为 **`schema_version: 4`**（整数，与 Python 包版本 `project_version` 无关），唯一版本值来自 `pyproject.toml` 的 `[tool.capricorncd].schema_version`。加载旧工程时会自动迁移：无论旧提示词位于 `settings`、工程顶层还是旧节点的 `global_prompt` 控件，`global_prompt` + `style_prompt` 都合并进 `prepend_prompt`，`non_diegetic_music` + `negative_prompt` 合并进 `append_prompt`；`prefix_prompt`、`prompt_prefix`、`suffix_prompt`、`prompt_suffix` 只作为迁移别名读取，不再写出。旧工程的 `ai_prompt` 与 `detailed_description` 会合并进 `prompt`，不再作为独立 Clip 字段写出。

通常由全屏编辑器读写，一般无需手改；下表与示例对应编辑器 `_buildProject()` 的写出格式。

### 顶层

| 字段 | 类型 | 说明 |
|------|------|------|
| `project_version` | string | 包版本字符串（如 `"0.x.y"`），写入时刷新 |
| `schema_version` | int | 文档形状版本，现为 `4` |
| `name` | string | 项目名称 |
| `media` | array | 素材目录；clip 用 `media_ids` 引用其中的 `id` |
| `settings` | object | 工程设置（含前置/后置提示词、水印、时间轴视图状态等） |
| `tracks` | array | 轨道列表（按 `order` 排列） |

旧字段 `resources` 仅作迁移输入，写出时不再保留。

### `media[]`（素材目录）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 素材 ID（如 `md_…`）；clip 的 `media_ids` 指向它 |
| `kind` | string | `image` / `video` / `audio` |
| `file` | string | 相对 ComfyUI `input/` 的路径（多为 `capricorncd-timeline/…`） |
| `location` | string | 通常为 `"input"` |
| `name` | string | 显示名 |
| `prompt` | string | 旧素材提示词，仅为兼容而保留；素材预览不再显示或编辑 |
| `generation_prompt` | string | 生成该图片时实际使用的完整提示词；无法读取时为空 |
| `setting_description` | string | 人物、物品或场景设定图描述与一致性约束；无法读取时为空 |
| `media_type` | string | 资产类型标签（如 character / scene / prop / other，可空） |
| `tags` | string[] | 标签 |
| `stars` | int? | 1–5；未评分时省略 |

导入图片包含受支持的 `ImageAssetMetadata` 时，编辑器会把其中的生成提示词和设定描述写入上述字段；元数据缺失时保持为空，不会猜测或重建原始提示词。

### `settings`

| 字段 | 类型 | 说明 |
|------|------|------|
| `fps` / `width` / `height` | number | 与节点标量同步的缓存副本 |
| `prepend_prompt` | string | 固定放在 Clip 启用提示词之前的完整内容，包含全局要求和风格提示词 |
| `append_prompt` | string | 固定放在 Clip 启用提示词之后的完整内容，包含环境音效、BGM 和负面约束 |
| `timeline_zoom` | number | 时间轴缩放 |
| `current_time` | number | 播放头时间（秒） |
| `timeline_scroll_left` / `timeline_scroll_top` | number | 时间轴滚动位置 |
| `watermark` | object | 合成视频水印（见下） |
| `use_clip_specified_video_filename` | bool | 默认 `true`。开启时运行写入 `output_video` 并按该路径关联生成视频；关闭走旧的自动识别 |
| `runtime_only_clip_ids` | string[]? | 仅单 clip「运行」时临时写入；正常保存通常无无 |
| `gen_video_stamp` | string? | 仅「运行」排队时临时写入（`yyyyMMdd-HHmmss`），供 `output_video` 与前端期望路径对齐 |

#### `settings.watermark`

| 字段 | 说明 |
|------|------|
| `enabled` | 默认 `true`；`false` 时预览和导出均不添加水印 |
| `mode` | 派生值：`none` / `text` / `image`；水印关闭时为 `none`，否则有未禁用图片时优先 image |
| `text.content` | 水印文字 |
| `text.fontFamily` / `text.fontPath` | 字体名 / 本机字体路径 |
| `text.fontSize` | 字号（约 6–400） |
| `text.letterSpacing` | 字间距（约 -50–200，默认 0） |
| `text.color` | `#RRGGBB` |
| `image.file` | 水印图片路径；空表示无 |
| `image.disabled` | 旧工程兼容字段：`true` 时忽略图片，回退到文字；界面不再单独提供此开关 |
| `opacity` | 0–100 |
| `scale` | 10–300（百分比） |
| `position` | `top-left` / `top-center` / `top-right` / `bottom-left` / `bottom-center` / `bottom-right` / `center` / `random-interval` / `random-fixed` |
| `margin` | `{ top, right, bottom, left, locked }` 边距（像素）；`locked` 为四边联动 |

### `tracks[]`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 轨道 ID |
| `type` | string | `visual` / `audio` / `subtitle` |
| `role` | string | `main` / `overlay` / `audio` / `subtitle` 等 |
| `name` | string | 显示名 |
| `order` | int | 自上而下顺序（0 起） |
| `enabled` | bool | 禁用则不进运行时 `data_json` |
| `visible` | bool | 不可见则跳过 |
| `muted` | bool | 音频轨 / 带音视频相关 |
| `locked` | bool | 锁定 |
| `color` | string | 轨道颜色 |
| `clips` | array | 片段列表 |

**字幕轨**（`type: "subtitle"`）仅用于节目预览叠字；节点执行时整轨跳过，不进入 `data_json`。

### `tracks[].clips[]`

时间一律用毫秒，且按工程 `fps` 对齐到帧网格：`start_ms` / `duration_ms`。

#### 视觉 clip（`type: "clip"`）

| 字段 | 说明 |
|------|------|
| `id` | clip ID |
| `enabled` / `visible` | 启用 / 可见 |
| `start_ms` / `duration_ms` | 时间轴区间 |
| `media_ids` | 有序引用 `media[].id`（多参考图 / 首尾帧 / 视频等） |
| `source` | 可选；视频等含 `in_ms` / `out_ms` / `duration_ms`（源内裁剪） |
| `name` | 标题 |
| `prompt` | Clip 提示词；MiniMax H3 工程在这里保存 `subject_definitions`、`summary`、`retention_analysis` |
| `prompt_includes` | Clip 内启用的提示词部分：`clip` 和/或 `resource`；`resource` 拼接素材的 `setting_description` |
| `use_prepend_prompt` | 是否在该 Clip 的提示词内容之前拼接工程 `prepend_prompt`（默认 `true`） |
| `use_append_prompt` | 是否在该 Clip 的提示词内容之后拼接工程 `append_prompt`（默认 `true`） |
| `use_media_prompts` | 兼容字段名；与 `media_ids` 等长，控制是否使用对应素材描述 |
| `media_enabled` | 与 `media_ids` 等长的 bool[]：该槽位是否启用 |
| `head_extend_sec` / `tail_extend_sec` | 首 / 尾扩展秒数 |
| `generate_preview_video` / `second_sample` | 生成相关开关 |
| `clip_role` | `multi_ref` / `first_last` / `t2v` / `video_ref` / `video_edit` / `other` |
| `clip_role_custom` | `clip_role === "other"` 时的自定义文案 |
| `agent` | 视频模型：`MiniMaxH3` / `LTX` / `Bernini` / `Wan` / `other`；为兼容已有工程保留字段名 |
| `agent_custom` | `agent === "other"` 时的自定义视频模型名 |
| `generated_videos` | 可选；绑定的生成 MP4：`{ id, file, enabled, muted, note }`（`file` 相对 `output/`） |
| `preview_mode` | 可选；`"generated"` 表示默认看生成视频预览 |
| `has_audio` / `muted` | 视频素材带音时可选 |
| `volume` | Clip 音频增益，范围 `0.0`–`2.0`；默认 `1.0` |

#### 音频 clip（`type: "audio"`）

| 字段 | 说明 |
|------|------|
| `media_ids` | 通常一个音频素材 ID |
| `source` | `in_ms` / `out_ms` / `duration_ms` |
| `muted` | 是否静音 |
| `volume` | Clip 音频增益，范围 `0.0`–`2.0`；默认 `1.0` |
| `volume_points` | 音量控制点数组：`{source_ms, gain}`；源音频内毫秒位置，增益 0–2。空数组为 100%；端点外保持最近点的增益。旧 `fade_in_ms` / `fade_out_ms` 载入时迁移 |

#### 字幕 clip（`type: "subtitle"`）

| 字段 | 说明 |
|------|------|
| `text` | 字幕正文 |
| `font_family` / `font_path` | 字体 |
| `font_size` | 字号 |
| `letter_spacing` | 字间距（默认 0） |
| `color` | `#RRGGBB` |
| `bold` / `italic` | 粗体 / 斜体 |
| `opacity` | 0–1 |
| `stroke_enabled` / `stroke_color` / `stroke_width` | 描边 |
| `shadow_enabled` / `shadow_color` / `shadow_blur` / `shadow_offset_x` / `shadow_offset_y` | 阴影 |
| `align` | `left` / `center` / `right` |
| `v_align` | `top` / `middle` / `bottom` |
| `offset_x` / `offset_y` | 相对画布的百分比偏移 |

### MiniMax H3 项目生成规范

MV、漫剧项目生成器必须按以下方式拆分每个 MiniMax H3 结果：

- 工程级提示词只使用 `settings.prepend_prompt` 与 `settings.append_prompt`：前者写全局要求和风格提示词，后者写环境音效、BGM 与负面约束。生成器不得写出旧全局提示词字段或独立的 `*_prefix_line` 字段。
- `prompt`：完整写入 `subject_definitions`、`summary`、`retention_analysis` 三段，并保留段落标题。
- `prompt`：保存完整的 Clip 提示词；MiniMax H3 内容包含带标题的 `subject_definitions`、`summary`、`retention_analysis` 与 `detailed_description`。
- `settings.append_prompt`：在后置内容中完整保存两个声音段落，先写 `overall_soundscape: ...`，再写 `non_diegetic_music: ...`，之后写负面约束。
- `prompt_includes`：`clip` 表示完整 Clip 提示词，`resource` 表示已启用素材的 `setting_description`；旧工程中的 `media` 会迁移为 `resource`。
- 提示词拼接顺序固定为：启用的 `prepend_prompt` → 启用的素材描述 → 启用的 Clip 提示词 → 启用的 `append_prompt`。

### 示例（schema 3，字段示意）

```json
{
  "project_version": "0.x.y",
  "schema_version": 4,
  "name": "未命名项目",
  "media": [
    {
      "id": "md_abc123",
      "kind": "image",
      "file": "capricorncd-timeline/shot01.png",
      "location": "input",
      "name": "shot01.png",
      "prompt": "",
      "generation_prompt": "生成 shot01.png 时实际使用的完整提示词",
      "setting_description": "人物设定描述与一致性约束",
      "media_type": "character",
      "tags": [],
      "stars": 3
    }
  ],
  "settings": {
    "fps": 24,
    "width": 1344,
    "height": 768,
    "prepend_prompt": "cinematic lighting",
    "append_prompt": "overall_soundscape:\n风声与衣料摩擦声。\n\nnon_diegetic_music:\nN/A\n\nNegative: subtitles, logos, watermarks",
    "timeline_zoom": 1.2,
    "current_time": 0,
    "timeline_scroll_left": 0,
    "timeline_scroll_top": 0,
    "watermark": {
      "mode": "text",
      "text": {
        "content": "Cap",
        "fontFamily": "Microsoft YaHei",
        "fontPath": "C:/Windows/Fonts/msyh.ttc",
        "fontSize": 32,
        "letterSpacing": 2,
        "color": "#ffffff"
      },
      "image": { "file": "", "disabled": false },
      "opacity": 80,
      "scale": 100,
      "position": "bottom-right",
      "margin": { "top": 24, "right": 24, "bottom": 24, "left": 24, "locked": true }
    }
  },
  "tracks": [
    {
      "id": "track_main",
      "type": "visual",
      "role": "main",
      "name": "主轨",
      "order": 0,
      "enabled": true,
      "visible": true,
      "muted": false,
      "locked": false,
      "color": "#4ea1ff",
      "clips": [
        {
          "id": "clip_1",
          "type": "clip",
          "enabled": true,
          "visible": true,
          "start_ms": 0,
          "duration_ms": 5000,
          "media_ids": ["md_abc123"],
          "name": "Clip",
          "prompt": "subject_definitions:\n<Picture 1>: 角色参考图\n\nsummary: [reference generation] 角色在舞台上演奏。\n\nretention_analysis:\n<Picture 1>: fully_preserved\n\ndetailed_description:\n[Shot 1] 镜头缓慢推近，角色按照音乐节奏演奏。",
          "prompt_includes": ["resource", "clip"],
          "use_prepend_prompt": true,
          "use_append_prompt": true,
          "use_media_prompts": [true],
          "media_enabled": [true],
          "head_extend_sec": 0,
          "tail_extend_sec": 0,
          "generate_preview_video": false,
          "second_sample": false,
          "clip_role": "multi_ref",
          "clip_role_custom": "",
          "agent": "MiniMaxH3",
          "agent_custom": "",
          "generated_videos": [
            {
              "id": "gv_1",
              "file": "MiniMax_H3/clip_1.mp4",
              "enabled": true,
              "muted": false,
              "note": ""
            }
          ]
        }
      ]
    },
    {
      "id": "track_sub",
      "type": "subtitle",
      "role": "subtitle",
      "name": "字幕",
      "order": 1,
      "enabled": true,
      "visible": true,
      "muted": false,
      "locked": false,
      "color": "#ff9e4a",
      "clips": [
        {
          "id": "sub_1",
          "type": "subtitle",
          "enabled": true,
          "visible": true,
          "start_ms": 0,
          "duration_ms": 3000,
          "name": "你好",
          "text": "你好",
          "font_family": "Microsoft YaHei",
          "font_path": "",
          "font_size": 48,
          "letter_spacing": 0,
          "color": "#ffffff",
          "bold": false,
          "italic": false,
          "opacity": 1,
          "stroke_enabled": true,
          "stroke_color": "#000000",
          "stroke_width": 3,
          "shadow_enabled": true,
          "shadow_color": "#000000",
          "shadow_blur": 4,
          "shadow_offset_x": 2,
          "shadow_offset_y": 2,
          "align": "center",
          "v_align": "bottom",
          "offset_x": 0,
          "offset_y": 8
        }
      ]
    }
  ]
}
```

---

## `data_json` 数据结构（运行时）

```json
{
  "project_version": "x.y.z",
  "schema_version": 4,
  "fps": 24.0,
  "width": 1344,
  "height": 768,
  "prepend_prompt": "cinematic",
  "append_prompt": "Negative: subtitles, logos, watermarks",
  "total_frame_count": 120,
  "run_prefix": "20260805_224215",
  "clips": [
    {
      "id": "runtime_0001",
      "source_clip_id": "clip_abc",
      "clip_type": "image",
      "start_ms": 0,
      "end_ms": 5000,
      "start_image": "/absolute/path/to/start.jpg",
      "end_image": "/absolute/path/to/end.jpg",
      "prompt": "close up",
      "z_index": 1,
      "audios": [
        {
          "source_clip_id": "audio_1",
          "source_kind": "audio",
          "file": "/absolute/path/to/voice.wav",
          "location": "input",
          "source_start_ms": 1000,
          "source_end_ms": 6000,
          "clip_offset_ms": 0
        }
      ]
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `run_prefix` | 本次执行生成的时间戳字符串（`YYYYMMDD_HHMMSS`），可直接用作统一文件名前缀 |
| `start_ms` / `end_ms` | 运行时片段时间区间（毫秒） |
| `start_image` / `end_image` | 经 ComfyUI `input` 解析后的绝对路径 |
| `audios[]` | 与该视觉区间重叠的音/视频切片；由 [Data Json Clip Parser](data-json-clip-parser.md) 混音。非音频轨无素材的时间段内，音频不导出 |
| `z_index` | 构建片段时使用的轨道叠放顺序 |
| `output_video` | 可选；开启「生成视频使用Clip指定文件名」时写入，形如 `CapTimelineEditor/[项目名]/yyyyMMdd-HHmmss_[clip_id].mp4`（相对 `output/`） |

没有顶层 `audio_path`。

整轨输出 `clips_audio`：按运行时视觉片段顺序，将各段对应音频混音后**首尾拼接**（视觉空档丢弃），时长与 `total_frame_count` / 序列帧对齐。

---

## 典型工作流

```
Timeline Editor
  ├── data_json      ──► Data Json Clip Parser（循环逐片段）
  ├── clips_length   ──► 循环上限
  ├── clips_audio    ──► 可选音频处理 / Seq To Video
  └── frame_seq_dir  ──► Save Images 的序列帧输出目录
```

序列帧与音频合成见 [Seq To Video](seq-to-video.md)，可运行示例见[工作流目录](../../workflows/)。
