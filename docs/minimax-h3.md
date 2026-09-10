# MiniMaxH3

## Continuous-shot context replacement

An adjacent preceding clip with `save_latent` prefers 22 context frames when the next setting is zero; positive settings prefer their H3-grid value. After padding, `previous.raw_frames - context_frames` must fall inside the previous visible source interval `[previous.context_frames + previous.head_frames, previous.raw_frames - previous.tail_frames)`. If not, the closest valid `17k+5` value is selected (for example 5 or 39). If none fits, generation reports an error instead of cropping outside the clip or shifting storyboard boundaries. The effective value is written to `h3_motion_context_length` and `h3_timing.context_frames`; `requested_context_frames` retains the requested value.

The next video's regenerated context replaces the preceding video's tail. For previous target X, previous tail padding n, context C and next target Y: keep `X+n-C` previous frames plus the next video's first `C-n` frames. Generate the next video by H3-aligning `Y+C-n`, then play Y frames starting at source offset `C-n`. Carry its new padding m forward; trim m from the final clip. Total playback remains X+Y. Explicit head extensions additionally use the snapshot's `head_frames`.

New snapshots use `h3_timing.version=2`: `context_frames` is the full model context C, while `context_carry_frames` is the preceding padding n. Filenames such as `__h3v2_..._s0_n4.mp4` preserve this distinction for manual linking. Legacy `h3v1` files retain their original interpretation. Rebuild data_json and generate new videos; removing the full C from raw output would lose the n frames that must remain visible.

`data_json.clips[].playback_spans` records source clip/file, zero-based `start_frame`, and `frame_count`. Compose Clip Videos consumes these spans. Linking original videos also creates the cross-clip tail reference for timeline playback and project export. Keep original, untrimmed generated videos: a file with context already removed cannot supply replacement frames.

**Category:** `Capricorncd`

Runs ComfyUI’s **MiniMax H3 Reference to Video** from a single Timeline Editor clip. Clip media become H3 reference slots; frame count and prompt come from that clip.

Accepts either:

- `data_json` + `index`, or
- **`clip_json`** from [Data Json Clip Parser](data-json-clip-parser.md) — when `clip_json` is non-empty, **`data_json` and `index` are ignored**

---

## How it works

1. Resolve the clip: prefer `clip_json`; otherwise load `data_json` and pick `index`
2. Collect visual refs (`images` + `videos`, or `start_image` / `end_image` fallback) and `audios[]`
3. Map media into H3 refs (caps below); build prompt from AI / media / global / clip text
4. Call `MiniMaxH3ReferenceToVideo` with CLIP, VAE, Audio VAE, `width` / `height`, and aligned frame length
5. Also emit stacked clip stills, video frames, and mixed clip audio for inspection or downstream use

| Kind | H3 slot | Limit | Notes |
|------|---------|-------|-------|
| Image | `ref_image_1…` | 9 | Still refs |
| Video | `ref_video_1…` (+ soundtrack → `ref_video_audio_n`) | 3 | Resampled to 24 fps, max 15 s, padded to ≥5 frames |
| Audio | `ref_audio_1…` | 3 | From clip `audios[]` slices; end may extend slightly to match H3 frame alignment |

`clip_json` is self-contained: `images` / `videos` entries already carry absolute `file` paths (and optional embedded `materials`).

---

## Prompt

Timeline Editor prompts are assembled in a fixed order: enabled `prepend_prompt` → enabled asset descriptions → enabled Clip prompt → enabled `append_prompt`. For MiniMax H3 projects, `clip.prompt` contains `subject_definitions`, `summary`, `retention_analysis`, and `detailed_description` as one complete structured prompt.

The Prompt Manager MiniMaxH3 Skill library supports both the [official MiniMax Skills](https://github.com/MiniMax-AI/MiniMax-H3/tree/main/skills) and the existing community repository, with official Skills listed first. Selecting `h3-prompt-writing` also injects `references/base-en.txt` and `references/ref-en.txt`, covering the official T2VA, I2VA, FL2VA, L2VA, and Ref2VA formats. On a Chinese UI, style Skills use `SKILL.cn.md` when provided.

---

## Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `clip` | CLIP | — | Text encoder for H3 |
| `vae` | VAE | — | Image / video VAE |
| `audio_vae` | VAE | — | Audio VAE |
| `width` | INT | 1344 | Generation width |
| `height` | INT | 768 | Generation height |
| `ref_image_size` | `match` / `max` | `match` | `match` = scale refs to generation pixel area; `max` = 2048px short edge |
| `data_json` | STRING | — | Runtime JSON from Timeline Editor (ignored when `clip_json` is set) |
| `index` | INT | 0 | Zero-based clip index (ignored when `clip_json` is set) |
| `clip_json` | STRING | — | Optional. Self-contained clip JSON; when non-empty, overrides `data_json` / `index` |

## Outputs

| Name | Type | Description |
|------|------|-------------|
| `positive` | CONDITIONING | H3 positive conditioning |
| `latent` | LATENT | H3 latent for sampling |
| `total_frame_count` | INT | Aligned frame count at **clip_json / data_json fps** (Timeline Editor fps), on the H3 17k+5 grid. Example: 7s at 60fps → ~430. |
| `prompt` | STRING | Effective prompt text sent to H3 |
| `images` | IMAGE | Stacked still refs (letterboxed); blank 64×64 if none |
| `videos` | IMAGE | Stacked video ref frames (letterboxed); blank if none |
| `audio` | AUDIO | Mixed clip audio (master trim or `audios[]`) |
| `seed` | INT | Clip seed from `clip_json` or `data_json[index]`; appended after `save_latent`. Missing/invalid values return `-1` (unset). |

Wire `positive` / `latent` into your MiniMax H3 sampler / decode chain as you would with the stock Reference to Video node.
Connect `seed` to `RandomNoise.noise_seed` or the sampler seed input. Set a nonnegative Clip seed (or generate a preview to save one) before sampling. Matching seeds alone do not reproduce a preview when resolution or sampling settings differ.

---

## Typical workflow

```
Timeline Editor
  └── data_json ──► Data Json Clip Parser (index = loop counter)
                         └── clip_json ──► MiniMaxH3
  └── width / height ──► MiniMaxH3
                             ├── positive, latent ──► H3 sample / decode ──► Save / Seq To Video
                             └── prompt, images, videos, audio ──► optional inspect / sidecar
```

Or wire `data_json` + `index` directly into MiniMaxH3 (no parser) when you do not need other parser outputs.

Disabled / hidden clips are already omitted from `data_json`, so selective re-runs use the same Disable / Enable flow as other timeline pipelines.

## Continuation timing

The timeline Run actions check contiguous H3 Save Latent → Context chains. If frame alignment requires different boundaries, a confirmation lists old/new times. Confirming keeps complete intermediate clips, shifts internal boundaries and adjusts the last context clip to preserve the chain's original start/end. Cancelling changes nothing and does not queue. No speed changes or whole-second requirement; other tracks and later shots stay in place. Changes can include unselected clips in the same chain and can be undone. Locked tracks, nonzero head/tail extensions or insufficient remaining tail duration block the adjustment.

H3 clips using Save Latent / Motion Context receive a generation snapshot in `data_json.clips[].h3_timing`: raw frames, effective context overlap, extension/final-tail trims, playable frames and planned playback positions. Planning precedes per-clip runtime filtering, so a selected continuation retains its predecessor context. Its corresponding latent must be available; regenerate the whole chain after changing timing. A chain's first clip has zero context.

Each shared boundary chooses the smaller move to a legal H3 frame count, either earlier or later, reserving minimum durations for the remaining clips. The final clip absorbs the remainder. Shortening changes the generation target before sampling; it does not cut away intermediate continuation tails afterward.

Example: three 5-second clips at 24fps, Save Latent on the first two and context=39 on the last two. After confirmation, boundaries are frames 0 / 124 / 243 / 360 (0 / 5.167 / 10.125 / 15 seconds). Generation uses 124 / 158 / 158 raw frames; context removal and a 2-frame final-tail cut leave 124 / 119 / 117 frames, exactly 15 seconds. Re-running does not change the boundaries again.

Specified filenames carry a suffix such as `__h3v1_c39_r175_h0_t0_f24000_s1`: effective context, raw frames, head/tail trims, fps × 1000 and Save Latent. Association uses this snapshot and the actual file duration, distinguishing raw and context-trimmed files without consulting edited Clip settings or trimming twice. Legacy filenames remain supported without guessing automatic trims.

Association still changes only internal source trims, never storyboard geometry. Boundary edits happen only after the run-time confirmation. Old generated files are not regenerated by changing the layout. Legacy `h3_layout` records retain their one-time repair behavior; newly confirmed edits do not use this legacy field.

For seamless continuation, avoid additional extension cuts at adjoining boundaries. Connect both decoded images and audio through H3 Motion Context Trim before saving; untrimmed files are also recognized. Missing continuation inputs or unexpected plugin trim counts now fail instead of silently saving an unrelated video with incorrect timing metadata. The separate H3 Timeline Sequence node retains its own segment planner.
