# Voice conversion API v1 / 音色转换接口约定

当前实现：角色参考音频绑定、解绑、试听；音频轨及视频修剪片段的右键入口；本机服务配置保存和可读取的协议约束。**尚未执行上传、换声、结果下载或替换音频。** 任意 T8 服务并不会因为填写地址就自动兼容。

Implemented: reference binding/audition, context-menu entry points, local settings and the machine-readable contract. Transport and conversion are not implemented yet. This is an adapter contract, not a claim that every T8 server supports it.

## 素材绑定 / Asset binding

`media[].voice_audio_id` optionally references one `kind: "audio"` entry in the same project catalog. An image/video setting asset can represent a character, animal or creature. Multiple assets may share one recording. Unbinding does not delete the audio file. Missing references are shown as missing and cannot be selected as conversion targets. Only use reference recordings you have permission to use.

角色设定素材使用 `voice_audio_id` 关联同工程内的音频素材 ID。参考音频作为普通工程素材导出；文件路径变化不改变 ID 绑定。不会把参考音频自动混入时间轴或传给导演视频模型。

## Local configuration / 本机配置

`GET /audio_keyframe_timeline/voice_settings` returns `config` with the public fields, `has_key`, `contract`, and `execution_available: false`.

`POST /audio_keyframe_timeline/voice_settings` accepts:

```json
{
  "url": "http://127.0.0.1:8000/voice/convert",
  "model": "",
  "timeout_seconds": 300,
  "api_key": "",
  "clear_key": false
}
```

URL is the full HTTP(S) conversion endpoint, not an assumed T8 default. Embedded credentials, query strings and fragments are rejected. Timeout is an integer from 10 to 1800 seconds. Empty URL clears the connection. Blank key keeps the saved key only for the same URL; changing the endpoint never silently reuses a key. `clear_key: true` deletes it. Keys are stored in the local user configuration file, not encrypted, never returned to the UI, and excluded from project/workflow exports. Protect the local configuration directory and ComfyUI itself; prefer HTTPS for any non-loopback connection.

## Service request / 服务请求

The future client submits a single `POST multipart/form-data` request to the configured endpoint. Optional authentication: `Authorization: Bearer <key>`.

| Part | Contract |
|---|---|
| `source_audio` | WAV, PCM16, 48000 Hz, mono; only the selected clip's trimmed source interval; 0.1–300 seconds |
| `reference_audio` | WAV, PCM16, 48000 Hz, mono; one bound reference; 1–30 seconds |
| `metadata` | JSON containing `contract`, `request_id`, `clip_id`, `character_media_id`, `duration_ms`, `model` |

`contract` must equal `capricorncd.voice.v1`; `request_id` is a UUID. `duration_ms` is a positive integer matching the submitted source. Total upload limit: 64 MiB. Do not send absolute filesystem paths or API keys in metadata. Reject an overlong reference and ask the user to trim it; do not silently choose a section.

视频修剪场景要应用素材源偏移和片段内裁剪，只提交选中的音频区间。视频原声若包含对白、BGM、环境声，需先分离对白；v1 不承诺自动分离或保留背景声。源区间和原文件保持不变。

## Service response / 服务响应

- Success: HTTP 200, `Content-Type: audio/wav`, PCM16, 48000 Hz, mono; maximum 64 MiB. Returned duration must differ from the source by no more than 100 ms. Container contents must be decoded and checked, not trusted from headers alone.
- Failure: HTTP 4xx/5xx with `application/json`, e.g. `{"error":{"code":"BUSY","message":"Service is running another task"}}`. Busy services use HTTP 409.
- Reject redirects, remote result URLs, filesystem paths, HTTP 202 asynchronous tasks, invalid audio, oversized output and out-of-tolerance durations. Do not automatically retry (duplicate processing risk), time-stretch, truncate, overwrite or replace the original on failure.

本地音频与视频任务必须串行：客户端提交前检查当前 ComfyUI 队列及自己的音频任务状态，服务端也必须原子地拒绝忙碌请求。不同服务共享显卡但没有忙碌协调机制时，不能宣称已保证全局互斥；需先停用其他生成服务。超时只代表客户端停止等待，不代表远端已终止。

未来生成结果应先保存为新文件、验证、再让用户确认关联；记录原工程、父 Clip、修剪片段、源音频区间及参考素材 ID，切换工程不能串写。当前版本没有提交按钮，因此不会启动本地并行任务。
