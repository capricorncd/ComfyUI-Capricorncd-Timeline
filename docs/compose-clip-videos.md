# Compose Clip Videos

Concatenate runtime `data_json.clips` in list order using each clip's `output_video`, relative to ComfyUI output. Disabled clips are skipped. Missing files fail instead of substituting another generation. Requires FFmpeg and FFprobe.

## Inputs

- `data_json`: Timeline Editor output with fps, timing and output_video.
- `filename_prefix`: defaults to `capricorncd-timeline/compose`.
- `trim_extends`: remove overlap and explicit extends, preserving H3 continuation tail frames. Total duration may exceed the timeline duration. Disable to keep complete files.
- `save_sidecar`: save source paths, prompts and workflow information beside the MP4.
- `audio` (optional AUDIO): plays from the start of the final video. Mixed with retained original sound, or used alone when original audio is disabled. Long audio is trimmed; short audio is padded with silence, without changing the video length.
- `use_original_audio`: defaults to true. Retain each source video's audio, inserting silence for silent segments. When false, omit all source audio; without an `audio` input, the output is silent.

Adding audio stream-copies the assembled video without another video encode. Composition metadata records whether original audio and the AUDIO input were used. Existing workflows default to retaining original audio; the new inputs do not shift existing widgets.

H3 continuation trimming requires the previous included clip's Save Latent to be true and the current clip's Motion Context to be enabled. The first clip has no preceding context. Save Latent on the current clip prepares the next clip; it does not itself require a context head trim. Frame counts distinguish complete and already head-trimmed renders. Ambiguous lengths or H3 FPS mismatches fail rather than silently cutting the wrong range. Use files and data_json from the same generation run.

Directory and filename-matching widgets are removed. Legacy data without output_video still supports the run_timestamp/run_prefix directory and FROM naming fallback. Old custom-directory workflows should supply output_video. Existing workflows retain their output prefix and trim/save selections.

The filename output is relative to ComfyUI output. This node concatenates clips; layered media, subtitles and timeline audio require timeline export.
