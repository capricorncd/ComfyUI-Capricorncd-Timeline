# Timeline Sequence Sampler and internal nodes

[All nodes](nodes.md) · [README](../README.md)

Category: `Capricorncd/MiniMaxH3`; helpers are under `Internal`. Use the compact [H3 Video Generator](h3-video-generator.md) for the main editor workflow. This sampler is an alternative for custom graphs that need decoded frames/audio and explicit sampler/SIGMAS inputs.

## Timeline Sequence Sampler

Node ID: `CAP_H3TimelineSequenceSampler`.

Connect Timeline Editor `data_json`, H3 `model`, `clip`, `vae`, `audio_vae`, a `SAMPLER` and `SIGMAS`. Set width/height, seed and reference image sizing. `max_segment_seconds` defaults to 10 (5–15); long spans are divided into segments. `drift_strength` defaults to 0.35 and `continue_audio` to true.

Connect `images → Seq To Video.images`, `audio → Seq To Video.audio`, and set the save node's fps to the timeline fps. `sequence_info` contains the segment plan and can go to Show Anything. `last_segment_latent (continuation only)` is only the last segment, not the complete video; decoding it cannot recover the full sequence. The sampler does not save videos itself. H3 Motion Context is required for active continuation.

## H3 Sequence Continuation

Node ID: `CAP_H3SequenceContinuation`. Inputs: `model`, target `latent`, `previous_latent`, `sigmas`, `context_frames` (39), `drift_strength` (0.35), `continue_audio` (true). Outputs: patched `model` and `latent` for the next sampler. Copies preceding AV context into the current segment and applies the scheduled denoise mask. Adjacent latent batch and spatial sizes must match.

## H3 Sequence Trim Video

Node ID: `CAP_H3SequenceTrimVideo`. Inputs: decoded `images`, `trim_frames` (0), `keep_frames` (124). Output: IMAGE batch after dropping the context prefix and retaining the requested frames; connect it to frame joining or video saving.

## H3 Sequence Trim Audio

Node ID: `CAP_H3SequenceTrimAudio` (also its fallback display name). Inputs: decoded `audio`, `trim_frames` (0), `keep_frames` (124). Output: AUDIO trimmed using the H3 24 fps timebase.

## H3 Sequence Audio Join

Node ID: `CAP_H3SequenceAudioJoin`. Inputs: accumulated `audio1`, next `audio2`, `overlap_frames` (0), `keep_frames` (124). Output: AUDIO, joined directly for zero overlap or with an equal-power crossfade across the overlap. Sample rates and batch sizes must match; mono may expand to the other input's channel count. Frame counts use H3's 24 fps timebase.

Internal nodes are built automatically by the sequence sampler. They are not additional connections required by the two-node editor workflow.
