# Image Batch Count / Image From Batch Index

**Category:** `Capricorncd`

Small utility nodes for working with `IMAGE` batches.

---

<!-- AUTO:API:begin -->
### Image Batch Count

Return the number of images in an IMAGE batch.

#### Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `images` | IMAGE | — | Input IMAGE batch |

#### Outputs

| Name | Type | Description |
|------|------|-------------|
| `count` | INT | Number of images in the batch (images.shape[0]) |

### Image From Batch Index

Return consecutive images from an IMAGE batch starting at index, along with the resolved starting index and default filename img_{index:05d}.png.

#### Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `images` | IMAGE | — | Input IMAGE batch |
| `index` | INT | `0` | Batch index; negative values count from the end (-1 = last) |
| `length` | INT | `1` | Number of images to take from index, limited to the remaining images |

#### Outputs

| Name | Type | Description |
|------|------|-------------|
| `image` | IMAGE | Selected image batch, limited to the remaining images |
| `index` | INT | Resolved index after negative normalization and clamping |
| `filename` | STRING | Default filename img_{index:05d}.png for the resolved index |
<!-- AUTO:API:end -->

## Notes

- Out-of-range positive indices are clamped to the last image.
- Negative indices are normalized before clamping, so `-1` always means the last frame.

---

## Example

```
IMAGE batch (48 frames)
  ├── Image Batch Count        → count = 48
  └── Image From Batch Index
        index = -1             → image, index = 47, filename = img_00047.png
```
