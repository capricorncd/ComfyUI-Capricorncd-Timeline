# H3 Motion Context 辅助节点

[全部节点](nodes.md) · [返回主页](../../README.zh.md)

分类：`Capricorncd/MiniMaxH3`。用于自行搭建 H3 采样流程；核心 H3 视频生成节点已负责续接。启用 Context 操作需要 ComfyUI-H3-Motion-Context。

## H3 Motion Context (Refine)

节点 ID：`CAP_H3MotionContextRefine`。

输入一采 `conditioning`、视频 `vae`、当前放大后的音视频 `latent`，将前一 Clip 的高清音视频 latent 接到 `context_latent`，MiniMaxH3 的 `trim_frames` 接到 `context_length`。输出 `conditioning` 接高清采样器的 guider。

它将一采续接条件替换为高清续接条件，并保留其他参考。Context 为 0 时直接传递条件；大于 0 时需要匹配的前段 latent 和有效的 H3 帧数（`17k+5`）。本节点不增加或裁剪视频帧。

## H3 Motion Context Load Latent (Optional)

节点 ID：`CAP_H3MotionContextLoadLatentOptional`。

连接片段解析器的 `load_context → load`，设置 output 下的 `latent_path` 文件或目录，以及前一 Clip 的 `clip_index`。输出 `context_latent` 接 MiniMaxH3 同名输入。关闭或无法取得 Context 时输出空 latent，让条件节点尝试前段视频回退。索引 0 使用最新文件；需要可重复重跑时指定明确槽位。

## H3 Motion Context Save Latent (Optional)

节点 ID：`CAP_H3MotionContextSaveLatentOptional`。

输入采样后的音视频 `latent`，MiniMaxH3 或解析器的 `save_latent → save`，设置 `filename_prefix` 和当前 `clip_index`。输出 `latent_path` 与原 `latent`。关闭时不写磁盘，路径为空。下一段需要高清精修时，另存最终高清 latent。

时序与尾部替换规则见 [MiniMaxH3](minimax-h3.md)；保存、加载槽位应对应预期续接链的相邻 Clip。
