from __future__ import annotations


def _resolve_batch_index(batch_size: int, index: int) -> int:
    batch_index = int(index)
    if batch_index < 0:
        batch_index += batch_size
    return max(0, min(batch_size - 1, batch_index))


class CAP_ImageBatchCount:
    """Return how many images are in an IMAGE batch."""

    DOC_SLUG = "image-batch"
    DOC_SECTION = "Image Batch Count"
    OUTPUT_TOOLTIPS = {
        "count": "Number of images in the batch (images.shape[0])",
    }

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE", {
                    "tooltip": "Input IMAGE batch",
                }),
            },
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("count",)
    FUNCTION = "execute"
    CATEGORY = "Capricorncd"
    DESCRIPTION = "Return the number of images in an IMAGE batch."

    def execute(self, images):
        return (int(images.shape[0]),)


class CAP_ImageFromBatchIndex:
    """Extract consecutive images from an IMAGE batch by index."""

    DOC_SLUG = "image-batch"
    DOC_SECTION = "Image From Batch Index"
    OUTPUT_TOOLTIPS = {
        "image": "Selected image batch, limited to the remaining images",
        "index": "Resolved index after negative normalization and clamping",
        "filename": "Default filename img_{index:05d}.png for the resolved index",
    }

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE", {
                    "tooltip": "Input IMAGE batch",
                }),
                "index": ("INT", {
                    "default": 0,
                    "min": -4096,
                    "max": 4096,
                    "tooltip": "Batch index; negative values count from the end (-1 = last)",
                }),
                "length": ("INT", {
                    "default": 1,
                    "min": 1,
                    "max": 4096,
                    "tooltip": "Number of images to take from index, limited to the remaining images",
                }),
            },
        }

    RETURN_TYPES = ("IMAGE", "INT", "STRING")
    RETURN_NAMES = ("image", "index", "filename")
    FUNCTION = "execute"
    CATEGORY = "Capricorncd"
    DESCRIPTION = (
        "Return consecutive images from an IMAGE batch starting at index, "
        "along with the resolved starting index and default filename img_{index:05d}.png."
    )

    def execute(self, images, index, length=1):
        batch_index = _resolve_batch_index(images.shape[0], index)
        filename = f"img_{batch_index:05d}.png"
        return (images[batch_index:batch_index + max(1, int(length))].clone(), batch_index, filename)


NODE_CLASS_MAPPINGS = {
    "CAP_ImageBatchCount": CAP_ImageBatchCount,
    "CAP_ImageFromBatchIndex": CAP_ImageFromBatchIndex,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "CAP_ImageBatchCount": "Image Batch Count",
    "CAP_ImageFromBatchIndex": "Image From Batch Index",
}
