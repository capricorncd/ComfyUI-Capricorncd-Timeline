# 字幕配音接口 / Subtitle speech API

## 使用 / Usage

字幕轨选中一条或多条 Clip，右键「绑定角色」或「转换成音频」。每条字幕可以选择角色、试听角色绑定的参考音频、编辑配音提示词。角色素材需要先绑定音频。选择空角色并保存可解除字幕的角色绑定。

在设置 → 字幕配音填写完整接口地址、可选模型名和 Bearer API Key。插件只提供客户端，不提供配音模型或服务器，也不直接兼容任意第三方协议；服务端需实现下述约定或自行编写适配器。

Select one or more subtitle clips and choose **Bind character** or **Convert to audio**. Review each character, audition their bound voice reference, and edit the delivery prompt. Configure your own endpoint under Settings → Subtitle speech. This plugin implements the client only, not the synthesis server/model.

只有确认转换才发送数据。每条字幕一个请求，顺序处理；失败停止剩余请求，已添加的音频保留。字幕文本原样发送，提示词中以 `#` 开头（可含前导空格）的行不发送。

Requests are sent only on confirmation, one subtitle at a time. Failure stops the remaining requests without removing successful results. Subtitle text is sent verbatim; prompt comment lines beginning with `#` are omitted.

## Request

`POST <configured full endpoint>`，`multipart/form-data`；配置了 Key 时添加 `Authorization: Bearer <key>`。密钥仅保存在 ComfyUI 用户目录的 `capricorncd/timeline_speech.json`，不写入工程导出；请自行限制该文件访问权限。远程服务建议使用 HTTPS。

Two multipart parts:

- `reference_audio`: `reference.wav`, `audio/wav`, PCM16 little-endian, mono, 48000 Hz, 1–30 seconds. Client converts the selected local reference; longer references are rejected rather than silently trimmed.
- `metadata`: `application/json`, example below. No local filesystem paths or entire project are sent.

```json
{
  "contract": "capricorncd.subtitle-speech.v1",
  "request_id": "8a087d9b-b77f-4b42-bf2a-fc1b4a982afb",
  "subtitle_id": "subtitle_03",
  "character_media_id": "character_girl",
  "text": "原来是你呀！",
  "prompt": "轻快、带一点惊喜，结尾轻笑。不要添加台词。",
  "start_ms": 10250,
  "end_ms": 13750,
  "duration_ms": 3500,
  "model": "your-model"
}
```

`start_ms` 和 `end_ms` 是**相对于整个工程时间轴**的毫秒整数，不是音频文件内部时间。开始包含，结束不包含。必须满足 `end_ms = start_ms + duration_ms`；`start_ms >= 0`，目标时长 100–300000 ms。不要在返回音频前添加 `start_ms` 长度的静音，由客户端负责放置。

Times are integer milliseconds relative to the **project timeline**, using an inclusive start and exclusive end. They are not source-audio offsets. The service must not prepend timeline-position silence. `duration_ms` is a delivery target, not permission to change or omit spoken text. Text is 1–4000 characters; prompt is at most 4000 characters. Preserve the text and language, using the reference for voice identity and the prompt for delivery only.

## Response

- Success: `200`, `Content-Type: audio/wav`, raw complete PCM16 mono 48000 Hz WAV, 0.1–300 seconds, maximum 32 MiB. No JSON/base64/result URL/job ID, redirects, or streaming partial files.
- Error: HTTP 4xx/5xx; busy should return `409`. Recommended body: `{"error":{"code":"busy","message":"Try after the current task finishes."}}`. The client reports HTTP failure and never automatically retries.
- The server should respect timeout settings (10–1800 seconds) and serialize access to its model. A timed-out request may still run remotely; inspect the server before retrying.

通过验证的音频保存到 `ComfyUI/input/capricorncd-timeline/audios/speech_<request_id>.wav`，自动作为音频素材添加，在原字幕起点放置。保留返回音频的实际时长，不拉伸、不截断；已有音频、字幕时间保持不变，有重叠时使用其他可用音频轨或新建轨道。

Validated audio is saved locally and placed at the original subtitle start, preserving its actual duration. Existing clips are not overwritten. Overlap uses another available audio track or a new track. If the project, subtitle timing/text, or character reference changes during the request, the file remains on disk but is not automatically inserted into a different context.

插件会在提交时检查当前 ComfyUI 队列，并防止本插件的配音请求并发；这不是跨进程 GPU 锁。其他工作流或外部客户端仍可能在请求后启动，服务端必须自行管理忙碌状态。

The client checks the ComfyUI queue before submission and prevents concurrent subtitle requests within this plugin. This is not a cross-process GPU lock; the external server must manage its own busy state.

## Project fields

Subtitle clips optionally persist `character_media_id` and `speech_prompt`. The referenced character media uses the existing one-to-one `voice_audio_id` binding. Older projects without these fields remain valid. Subtitle timing is unchanged; request `end_ms` is calculated from current clip start and duration, not stored as a second independent timing value.
