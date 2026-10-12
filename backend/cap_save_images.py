from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
import zipfile
from datetime import datetime
from xml.etree import ElementTree

from aiohttp import web
import folder_paths
import numpy as np
from PIL import Image, PngImagePlugin

from .cap_save_sidecar import build_sidecar_payload, write_sidecar
from .cap_reveal_file import reveal_file


# Keep only paths, never image tensors, for recent save batches.
saved_image_batches = {}


def image_metadata_options(path, prompt, extra_pnginfo, note, parameters):
    fields = dict(extra_pnginfo or {})
    if prompt is not None:
        fields["prompt"] = prompt
    fields["CapricorncdSaveImages"] = parameters
    if note:
        fields["Comment"] = note
    fields.setdefault("ImageAssetMetadata", {
        "schema_version": 1,
        "asset_name": os.path.basename(path),
        "asset_type": "image",
        "generation_prompt": None,
        "generation_prompt_status": "unavailable",
        "generation_prompt_source": "ComfyUI graph retained; exact final generation text not supplied.",
        "generation_mode": "external",
        "reference_images": [],
    })
    image_format = Image.registered_extensions().get(os.path.splitext(path)[1].lower())
    if image_format == "PNG":
        pnginfo = PngImagePlugin.PngInfo()
        for key, value in fields.items():
            pnginfo.add_itxt(key, value if isinstance(value, str) else json.dumps(value, ensure_ascii=False))
        return {"pnginfo": pnginfo}
    if image_format == "GIF":
        return {"comment": json.dumps(fields, ensure_ascii=False).encode("utf-8")}
    if image_format not in {"JPEG", "WEBP", "TIFF"}:
        logging.warning("[Capricorncd] %s cannot store generation metadata; use PNG, JPEG, WebP or TIFF.", image_format)
        return {}

    xmp = ElementTree.Element("{adobe:ns:meta/}xmpmeta")
    rdf = ElementTree.SubElement(xmp, "{http://www.w3.org/1999/02/22-rdf-syntax-ns#}RDF")
    description = ElementTree.SubElement(rdf, "{http://www.w3.org/1999/02/22-rdf-syntax-ns#}Description")
    text = ElementTree.SubElement(description, "{http://purl.org/dc/elements/1.1/}description")
    text.text = json.dumps(fields, ensure_ascii=False)
    packet = ElementTree.tostring(xmp, encoding="utf-8")
    if image_format == "TIFF":
        return {"tiffinfo": {700: packet}}
    if image_format == "JPEG" and len(packet) > 65504:
        raise ValueError("Generation metadata exceeds the JPEG XMP limit; save as PNG, WebP or TIFF.")
    return {"xmp": packet}


def register_save_image_routes(routes):
    def saved_path(request):
        paths = saved_image_batches.get(request.match_info["token"], ())
        try:
            index = int(request.match_info["index"])
        except ValueError:
            raise web.HTTPNotFound() from None
        if index < 0 or index >= len(paths):
            raise web.HTTPNotFound()
        path = paths[index]
        if os.path.realpath(path) != path or not os.path.isfile(path):
            raise web.HTTPNotFound()
        return path

    @routes.get("/cap/saved_images/{token}/{index}")
    async def preview_saved_image(request):
        return web.FileResponse(saved_path(request))

    @routes.post("/cap/saved_images/{token}/{index}/reveal")
    async def reveal_saved_image(request):
        origin = request.headers.get("Origin")
        if (request.remote not in {"127.0.0.1", "::1", "::ffff:127.0.0.1"}
                or request.content_type != "application/json"
                or (origin and origin != f"{request.scheme}://{request.host}")):
            raise web.HTTPForbidden()
        await asyncio.to_thread(reveal_file, saved_path(request))
        return web.json_response({"ok": True})


class CAP_SaveImages:
    """Save an IMAGE batch to disk (relative under output, or absolute anywhere)."""

    DOC_SLUG = "save-images"
    OUTPUT_TOOLTIPS = {
        "image_dir": "Absolute path of the directory where images were saved",
        "image_paths": "Comma-separated list of saved file paths",
    }

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE", {
                    "tooltip": "Batch of images to save",
                }),
                "filename_prefix": ("STRING", {
                    "default": "temp/cap-save-images/%Y%m%d_%H%M%S/CSI",
                    "tooltip": (
                        "Relative to ComfyUI output: earlier segments are subfolders, "
                        "last segment is the file prefix. "
                        "An absolute path is the save directory anywhere on disk "
                        "(prefix defaults to CSI). Supports strftime."
                    ),
                }),
                "filename": ("STRING", {
                    "default": "{prefix}_{index}.png",
                    "tooltip": "File name template with {prefix} and {index} (zero-padded to 5 digits)",
                }),
                "quality": ("INT", {
                    "default": 100,
                    "min": 1,
                    "max": 100,
                    "step": 1,
                    "tooltip": "JPEG quality (1–100); for PNG mapped to zlib compression",
                }),
                "dpi": ("INT", {
                    "default": 72,
                    "min": 1,
                    "max": 2400,
                    "step": 1,
                    "tooltip": "DPI metadata written to the image file",
                }),
                "save_as_zip": ("BOOLEAN", {
                    "default": False,
                    "label_on": "Zip",
                    "label_off": "Images only",
                    "tooltip": "Also pack saved images into a zip next to the folder",
                }),
                "save_sidecar": ("BOOLEAN", {
                    "default": False,
                    "label_on": "Save JSON",
                    "label_off": "Skip",
                    "tooltip": "Also write a JSON next to the sequence. Generation parameters are embedded in each image regardless of this option.",
                }),
            },
            "optional": {
                "metadata": ("STRING", {
                    "default": "",
                    "tooltip": "Note embedded in image metadata and included in the optional JSON",
                }),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("image_dir", "image_paths")
    FUNCTION = "save_images"
    OUTPUT_NODE = True
    CATEGORY = "Capricorncd/Image"
    DESCRIPTION = (
        "Save a batch of images to disk. "
        "Relative filename_prefix is under ComfyUI output (last segment = file prefix). "
        "Absolute filename_prefix is the save directory anywhere on disk "
        "(file prefix defaults to CSI). Supports strftime. "
        "filename supports {prefix} and {index} (zero-padded to 5 digits). "
        "PNG, JPEG, WebP and TIFF embed generation parameters, the ComfyUI prompt graph and workflow. "
        "When save_as_zip is true, also pack the saved images into a zip next to the folder. "
        "When save_sidecar is true, write {prefix}.json in the save directory "
        "with prompts, models, and sampler settings."
    )

    def _resolve_save_dir(self, filename_prefix: str) -> tuple[str, str]:
        output_dir = os.path.abspath(folder_paths.get_output_directory())
        raw = datetime.now().strftime((filename_prefix or "CSI").strip())

        if os.path.isabs(raw):
            # Absolute path = save directory anywhere on disk.
            save_dir = os.path.abspath(os.path.normpath(raw))
            name_prefix = "CSI"
            return save_dir, name_prefix

        resolved = raw
        for lead in ("output/", "output\\", "./output/", "./output\\"):
            if resolved.startswith(lead):
                resolved = resolved[len(lead):]
                break

        resolved = os.path.normpath(resolved.replace("\\", "/"))
        if resolved in (".", ""):
            resolved = "CSI"

        subfolder = os.path.dirname(resolved)
        name_prefix = os.path.basename(resolved) or "CSI"
        save_dir = os.path.join(output_dir, subfolder) if subfolder else output_dir
        save_dir = os.path.abspath(save_dir)

        try:
            under_output = os.path.commonpath((output_dir, save_dir)) == output_dir
        except ValueError:
            under_output = False
        if not under_output:
            raise Exception(
                "Relative filename_prefix must resolve under the ComfyUI output folder.\n"
                f" save_dir: {save_dir}\n"
                f" output_dir: {output_dir}"
            )
        return save_dir, name_prefix

    def save_images(
        self,
        images,
        filename_prefix,
        filename,
        quality,
        dpi,
        save_as_zip=False,
        save_sidecar=False,
        metadata="",
        prompt=None,
        extra_pnginfo=None,
    ):
        save_dir, name_prefix = self._resolve_save_dir(filename_prefix)
        os.makedirs(save_dir, exist_ok=True)

        if not isinstance(metadata, str):
            metadata = str(metadata)

        parameters = build_sidecar_payload(name_prefix, note=metadata, prompt=prompt,
                                          extra={"quality": quality, "dpi": dpi})
        saved_paths = []
        for image in images:
            img = Image.fromarray((image.cpu().numpy() * 255).astype(np.uint8))

            index = 0
            while True:
                path = os.path.join(
                    save_dir,
                    filename.format(index=f"{index:05d}", prefix=name_prefix),
                )
                if not os.path.exists(path):
                    break
                index += 1

            image_parameters = {**parameters, "file": os.path.basename(path)}
            options = image_metadata_options(path, prompt, extra_pnginfo, metadata, image_parameters)
            img.save(path, quality=quality, dpi=(dpi, dpi), **options)
            del image
            saved_paths.append(path)

        sidecar = ""
        if save_sidecar and saved_paths:
            sidecar = write_sidecar(
                os.path.join(save_dir, f"{name_prefix}.json"),
                build_sidecar_payload(
                    f"{name_prefix}.json",
                    note=metadata,
                    prompt=prompt,
                    extra={"files": [os.path.basename(p) for p in saved_paths]},
                ),
            )

        if save_as_zip and saved_paths:
            save_dir_stripped = save_dir.rstrip("/\\")
            zip_path = f"{save_dir_stripped}.zip"
            with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                for path in saved_paths:
                    zf.write(path, arcname=os.path.basename(path))
                if sidecar and os.path.isfile(sidecar):
                    zf.write(sidecar, arcname=os.path.basename(sidecar))

        token = uuid.uuid4().hex
        saved_image_batches[token] = tuple(os.path.realpath(path) for path in saved_paths)
        while len(saved_image_batches) > 128:
            del saved_image_batches[next(iter(saved_image_batches))]
        return {"ui": {"cap_saved_images": [
            {"filename": os.path.basename(path), "token": token, "index": index}
            for index, path in enumerate(saved_paths)
        ]}, "result": (save_dir, ", ".join(saved_paths))}


NODE_CLASS_MAPPINGS = {"CAP_SaveImages": CAP_SaveImages}
NODE_DISPLAY_NAME_MAPPINGS = {"CAP_SaveImages": "Save Images"}
