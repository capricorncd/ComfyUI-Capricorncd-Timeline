# H3 面部修复配置

将此节点连接到 **MiniMax H3 视频生成 → 面部修复配置**，再开启生成节点的 **面部修复**（默认关闭）。安装可选依赖 [ComfyUI-H3-FaceRefine](https://github.com/Carasibana/ComfyUI-H3-FaceRefine) 后需要重启 ComfyUI。

请将 `face_yolov8m.pt` 放入原节点使用的标准目录 `models/ultralytics/bbox`，也支持已注册的外部 `ultralytics_bbox` 目录。请选择人脸检测模型，不要选择手部或人体检测模型。不会自动下载模型，此接入不依赖 Impact-Pack。

每个 Clip 跟踪一张脸。「选择方式」用于首次选择，「人物序号」从 0 开始，随后按位置连续跟踪。不加载身份识别模型，不自动切分场景；多人交叉或切镜可能需要拆分 Clip。全片检测不到人脸时会报错，可降低置信度或关闭本次修脸。

默认参数：置信度 0.35、降噪强度 0.4、大脸修复倍率 0.35、画布 768、裁剪倍率 2.5、平滑窗口 21、羽化 6、混合比例 1.0。大脸的处理更轻；提高降噪可能改变长相，增大画布会增加显存需求。

修脸安排在运动去模糊之后，复用生成节点连接的模型及对应的 4/8 步 LoRA。增加一次裁剪区域编码、采样和解码，再仅贴回脸部。保留原音轨、帧数、Context 前缀和严格首尾帧；裁剪采样不使用全画面首尾帧及 Context 音频锚点。连续镜头缓存从最终修复画面重新编码，会增加耗时。采样时音频潜空间使用零噪声遮罩，不能保证口型同步或画面质量。CPU 集成测试模拟了模型/VAE 推理，实际 GPU 生成效果仍待验证。

## 来源与致谢

检测跟踪、裁剪、自适应逐帧降噪和贴回由 **Carasibana** 的 [ComfyUI-H3-FaceRefine](https://github.com/Carasibana/ComfyUI-H3-FaceRefine) 提供，Copyright (c) 2026 Carasibana，MIT 许可。核对版本：[d8521d14fe0d721d80cd9417fff5a559cbc21aba](https://github.com/Carasibana/ComfyUI-H3-FaceRefine/tree/d8521d14fe0d721d80cd9417fff5a559cbc21aba)。Cap 调用安装的原作者节点；算法实现和 LICENSE 保留在原插件中。

YOLO 推理由 [Ultralytics](https://github.com/ultralytics/ultralytics) 提供；[Bingsu/adetailer](https://huggingface.co/Bingsu/adetailer) 等检测权重遵循各自来源的许可。原插件的 MIT 许可不替代依赖库或模型许可。
