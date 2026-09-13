# Size Settings

**Category:** `Capricorncd`

Computes `width` / `height` from a size preset, scale multiplier, and orientation, with optional aspect-ratio lock while editing custom dimensions. Also outputs `count` and `fps`.

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

## Notes

- Changing **Size**, **Scale**, or **Orientation** recalculates Width / Height.
- With **Lock Aspect** on, editing Width updates Height (and vice versa) to keep the current ratio.
- Orientation **纵向** keeps the preset as shown; **横向** swaps width and height (no-op for 1:1).
- Connect `width` / `height` / `fps` into **Timeline Editor** or any node that needs canvas size and frame rate.

## Size From Megapixels

**Node:** `CAP_SizeFromMegapixels` · **Category:** `Capricorncd`

Connect integer `width` and `height` to the visible INT input sockets, then set `megapixels` (default 1.0) to calculate new integer width/height outputs. For manual dimensions, connect integer nodes. STRING outputs need conversion to INT first. This node uses the actual input dimensions, not an aspect-ratio preset. It computes sizes only; it does not resize images or videos.

Like ComfyUI's Resolution Selector, the target area is `megapixels × 1024 × 1024`. Both dimensions scale together, then round to `multiple` (default 32; adjustable for other models). Alignment can slightly change the ratio and pixel count. Both upscaling and downscaling are supported.

Example: input `1920 × 1080`, `megapixels = 0.2`, `multiple = 32` → `608 × 352`.

Outputs, in order: `width` (INT), `height` (INT), `megapixels` (FLOAT), `multiple` (INT). The last two output the configured values; megapixels is the target, not the rounded output area. Connect `multiple` to an upscaler's `align` input.
