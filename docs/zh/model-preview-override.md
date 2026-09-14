# Cap Model Preview Override（模型预览覆盖）

[节点索引](nodes.md) · [English](../model-preview-override.md)

用于普通工作流、子图和 for 循环的采样预览。节点内显示最新图片或动图，时间轴「运行与预览」也能接收其预览。

## 依赖与封装原因

需要安装包含 `ModelPreviewOverrideKJ` 的 **ComfyUI-KJNodes**。这是运行时适配节点，不是把 KJNodes 代码复制进项目：解码与采样预览仍使用原节点的引擎，不修改 KJNodes 的任何文件。

本封装针对的 KJNodes 实现直接用执行节点 ID 发送预览事件。for 循环展开后产生临时节点 ID，原前端无法据此找到原来的节点，后续循环的预览可能不再更新。封装在添加预览包装器前，通过 ComfyUI 获取原始显示节点 ID，同时保留子图的完整 ID，再由自己的预览窗口接收事件。

原节点并非所有场景都不能使用，普通工作流仍可使用。直接修改第三方节点不适合发布：更新可能覆盖修改，其他用户安装的原版也没有这项修复。

## 使用方法

1. 安装 Timeline 与 KJNodes，重启 ComfyUI 并刷新页面。
2. 将原来的 **Model Preview Override** 替换为 **Cap Model Preview Override**（`CAP_ModelPreviewOverride`）。保留 MODEL、VAE、帧数连线并复制原设置；同一 MODEL 路径不需要串联两个预览覆盖节点。
3. 输出 MODEL 接到采样器使用的模型/Guider 路径。二采工作流要让两次采样都使用经过预览覆盖的 MODEL，才能分别显示预览。
4. `preview_frames` 大于 1 时，在模型与解码器支持的情况下显示动图；`preview_fps` 只控制预览播放速度。`tiny_vae` 从 `models/vae_approx` 选择适配的解码器，也可以保留原来的 VAE 配置；节点不会下载模型。
5. 正常运行，或点击「提示词管理 → 运行与预览」。每次循环更新同一个预览窗口，最终视频仍由工作流的视频保存节点输出。

封装不改变模型权重、种子、采样设置或生成时长。预览解码仍有开销，尺寸越大、预览帧越多，可能越慢。新窗口显示预览与步数，不复制原节点的完整统计界面。

发布工作流时，注明依赖 **ComfyUI-Capricorncd-Timeline + ComfyUI-KJNodes** 即可，不需要用户修改 KJNodes。
