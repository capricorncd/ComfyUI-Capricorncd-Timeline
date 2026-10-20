"""Adapt saved RefMods at the Timeline/H3 conditioning boundary."""
import nodes


def refmod_file_state(rows):
    if not rows:
        return ()
    loader_cls = nodes.NODE_CLASS_MAPPINGS.get("MiniMaxH3RefModsLoader")
    if loader_cls is None:
        return float("nan")
    return tuple(loader_cls.IS_CHANGED(mod_1=str(row.get("path") or "")) for row in rows
                 if row.get("enabled") is not False and float(row.get("strength", 1)) > 0)


def load_refmods(rows, counters):
    if not rows:
        return [], []
    loader_cls = nodes.NODE_CLASS_MAPPINGS.get("MiniMaxH3RefModsLoader")
    if loader_cls is None:
        raise ValueError("Install or enable ComfyUI-MiniMaxH3Mod to use Timeline RefMods.")
    counters = dict(counters)
    labels = {"image": "Picture", "video": "Video", "audio": "Audio"}
    mods, references = [], []
    loader = loader_cls()
    for row in rows:
        path = str(row.get("path") or "")
        if row.get("enabled") is False:
            references.append(({"name": path}, path))
            continue
        loaded, _ = loader.load(mod_1=path, strength_1=float(row.get("strength", 1)), copies_1=1)
        tags = []
        for mod, strength in loaded:
            counters[mod.kind] += 1
            tags.append(f"<{labels[mod.kind]} {counters[mod.kind]}>")
            mods.append((mod, strength))
        references.append(({"name": path, "description": row.get("description", "")}, " and ".join(tags) or path))
    return mods, references


class RefModPromptClip:
    def __init__(self, clip, mods, vae):
        encoder_cls = nodes.NODE_CLASS_MAPPINGS.get("MiniMaxH3RefModTextEncode")
        if encoder_cls is None:
            raise ValueError("Update ComfyUI-MiniMaxH3Mod to use Timeline RefMod presentation.")
        self.clip = clip
        self.items, self.blocks = encoder_cls.prepare_references(mods, vae)

    def tokenize(self, prompt, **kwargs):
        items = list(kwargs.pop("minimax_ref_items", None) or [])
        if not items:
            items = [{"type": "image", "data": image} for image in kwargs.pop("images", [])]
        return self.clip.tokenize(prompt, minimax_ref_items=items + self.items, **kwargs)

    def encode_from_tokens_scheduled(self, tokens):
        return self.clip.encode_from_tokens_scheduled(tokens)

    def attach(self, conditioning):
        return [[embedding, {**metadata, "minimax_refs": list(metadata.get("minimax_refs", [])) + self.blocks}]
                for embedding, metadata in conditioning]
