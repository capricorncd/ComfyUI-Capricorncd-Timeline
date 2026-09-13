# Size Settings（尺寸设置）

**分类：** `Capricorncd`

根据尺寸预设、倍数与方向计算 `width` / `height`，编辑自定义宽高时可锁定比例。同时输出 `count` 与 `fps`。

---

<!-- AUTO:API:begin -->
Output width, height, count, and fps (float + int) from size presets, scale, orientation, and optionally locked custom dimensions.

#### Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `size` | ENUM | `720x1280 (9:16)` | Base canvas size preset (portrait dimensions shown) |
| `scale` | FLOAT | `1.0` | Multiplier applied to the size preset |
| `lock_aspect` | BOOLEAN | true | When locked, editing width updates height (and vice versa) to keep the aspect ratio |
| `orientation` | ENUM | `纵向` | 纵向 keeps preset WxH; 横向 swaps width and height |
| `custom_width` | INT | `720` | Width used at run time (aligned to multiples of 8) |
| `custom_height` | INT | `1280` | Height used at run time (aligned to multiples of 8) |
| `fps` | FLOAT | `24.0` | Frames per second |
| `count` | INT | `1` | Reusable integer output (e.g. batch size or loop count) |

#### Outputs

| Name | Type | Description |
|------|------|-------------|
| `width` | INT | Final width aligned to a multiple of 8 |
| `height` | INT | Final height aligned to a multiple of 8 |
| `count` | INT | Pass-through integer (batch size, loop count, etc.) |
| `fps` | FLOAT | Frames per second (float) |
| `fps_int` | INT | Frames per second rounded to int |
<!-- AUTO:API:end -->

## 说明

- 修改 **尺寸**、**倍数** 或 **方向** 会重新计算宽度 / 高度。
- 开启 **锁定比例** 时，改宽度会按比例更新高度（改高度同理）。
- **纵向** 保持预设宽高；**横向** 交换宽高（1:1 无变化）。
- 可将 `width` / `height` / `fps` 接到 **Timeline Editor** 或其他需要画布尺寸与帧率的节点。

## 按百万像素计算尺寸

**节点：** `CAP_SizeFromMegapixels`（Size From Megapixels）· **分类：** `Capricorncd`

宽度 `width`、高度 `height` 直接显示为 INT 连接接口，接入上游整数输出后，设置 `megapixels`（默认 1.0），输出计算后的整数宽、高。手动设置尺寸可连接整数节点；STRING 输出需要先转换为 INT。不需要选择宽高比预设。该节点只计算尺寸，不处理图片或视频像素。

与 ComfyUI 的 Resolution Selector 一致，目标像素面积为 `megapixels × 1024 × 1024`。宽高按相同比例缩放后，分别四舍五入到 `multiple` 的整数倍（默认 32，可按其他模型要求调整），因此实际比例和像素总量可能略有偏差。支持放大与缩小。

示例：输入 `1920 × 1080`，`megapixels = 0.2`，`multiple = 32` → 输出 `608 × 352`。

输出顺序：`width`（INT）、`height`（INT）、`megapixels`（FLOAT）、`multiple`（INT）。后两项输出节点当前设置值；百万像素是目标值，不是取整后尺寸的实际像素面积。可将 `multiple` 连接到放大节点的 `align`。
