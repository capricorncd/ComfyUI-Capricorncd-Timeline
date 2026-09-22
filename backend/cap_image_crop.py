import json
import math
from pathlib import Path

from PIL import Image, ImageOps, PngImagePlugin


def crop_image_file(source, destination, rect):
    if not isinstance(rect, dict):
        raise ValueError("Invalid crop rectangle.")
    values = [float(rect[key]) for key in ("x", "y", "width", "height")]
    if not all(math.isfinite(value) for value in values):
        raise ValueError("Invalid crop coordinates.")
    x, y, width, height = values
    if min(x, y) < 0 or min(width, height) <= 0 or x + width > 1.000001 or y + height > 1.000001:
        raise ValueError("Crop must be inside the original image.")
    with Image.open(source) as original:
        image = ImageOps.exif_transpose(original)
        w, h = image.size
        box = (round(x * w), round(y * h), round((x + width) * w), round((y + height) * h))
        if box[2] <= box[0] or box[3] <= box[1]:
            raise ValueError("Crop is smaller than one pixel.")
        cropped = image.crop(box)
        if cropped.mode not in ("RGB", "RGBA", "L", "LA", "P", "I", "I;16"):
            cropped = cropped.convert("RGBA" if "A" in cropped.getbands() else "RGB")
        metadata = PngImagePlugin.PngInfo()
        for key, value in image.info.items():
            if isinstance(value, str):
                metadata.add_itxt(key, value)
        if "ImageAssetMetadata" not in image.info:
            metadata.add_itxt("ImageAssetMetadata", json.dumps({
                "schema_version": 1, "asset_name": Path(source).stem, "asset_type": "image",
                "generation_prompt": None, "generation_prompt_status": "unavailable",
                "generation_prompt_source": "No canonical generation record; original metadata retained.",
                "generation_mode": "unknown", "reference_images": [],
            }))
        metadata.add_itxt("TimelineCrop", json.dumps({"source": Path(source).name, "rect": rect}))
        options = {key: image.info[key] for key in ("icc_profile", "exif", "dpi", "transparency") if key in image.info}
        Path(destination).parent.mkdir(parents=True, exist_ok=True)
        cropped.save(destination, format="PNG", pnginfo=metadata, **options)
        return {"width": cropped.width, "height": cropped.height}
