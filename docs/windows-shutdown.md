# Shutdown after workflow completion (Windows)

[All nodes](nodes.md) · [简体中文](zh/windows-shutdown.md)

Node ID: `CAP_WindowsShutdown`. Category: `Capricorncd/Utils`. This output node has no outputs.

Connect the final operation's output (or a loop-end output) to the required `trigger`. `enabled` defaults to true; `condition` defaults to always. Optional conditions compare trigger with `match_value`: number_equals, string_equals, string_starts_with, string_ends_with or string_includes. Numeric strings are not converted to numbers; string comparisons are case-sensitive.

`delay_seconds` defaults to 60. Executing the node registers a request; shutdown starts only after successful workflow completion and an empty queue. Failures/cancellation clear pending requests; multiple requests use the longest delay. Disabling or removing the node does not revoke a previously registered request; restart ComfyUI to clear a request that has not fired.

Windows shutdown forcibly closes applications, so save your work. Once the system countdown starts, use `shutdown /a` to cancel it. New queued tasks or changes to the node do not cancel that countdown.
