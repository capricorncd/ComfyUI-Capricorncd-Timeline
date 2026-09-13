import logging
import os
import subprocess
from decimal import Decimal, InvalidOperation
from numbers import Real

from comfy_execution.utils import get_executing_context
from server import PromptServer


class ShutdownController:
    def __init__(self, queue):
        self.queue = queue
        self.pending = {}
        self.ready_delay = None
        self.original_task_done = queue.task_done
        # There is no completion callback API; keep the adapter on this queue instance.
        queue.task_done = self.task_done

    def arm(self, prompt_id, delay_seconds):
        with self.queue.mutex:
            self.pending[prompt_id] = max(delay_seconds, self.pending.get(prompt_id, 0))

    def task_done(self, item_id, history_result, status, process_item=None):
        with self.queue.mutex:
            prompt_id = self.queue.currently_running[item_id][1]
            delay = self.pending.pop(prompt_id, None)
            result = self.original_task_done(item_id, history_result, status, process_item)
            if status is None or not status.completed or status.status_str != "success":
                self.ready_delay = None
                self.pending.clear()
            elif delay is not None:
                self.ready_delay = max(delay, self.ready_delay or 0)

            if self.ready_delay is not None and self.queue.get_tasks_remaining() == 0:
                delay = self.ready_delay
                self.ready_delay = None
                command = [os.path.join(os.environ["SystemRoot"], "System32", "shutdown.exe"),
                           "/s", "/f", "/t", str(delay)]
                try:
                    subprocess.run(command, check=True, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
                except (OSError, subprocess.CalledProcessError) as error:
                    logging.error("Windows shutdown failed: %s", error)
                else:
                    logging.warning("Windows will force shutdown in %s seconds. Cancel with: shutdown /a", delay)
        return result


_controller = None


def _matches_condition(trigger, condition, match_value):
    if condition == "always":
        return True
    if condition == "number_equals":
        try:
            expected = Decimal(match_value)
        except InvalidOperation as error:
            raise ValueError("数字等于条件的 match_value 必须填写有效数字。") from error
        if not expected.is_finite():
            raise ValueError("数字等于条件的 match_value 必须是有限数字。")
        if isinstance(trigger, bool) or not isinstance(trigger, (Real, Decimal)):
            return False
        actual = Decimal(str(trigger))
        return actual.is_finite() and actual == expected
    if condition not in ("string_equals", "string_starts_with", "string_ends_with", "string_includes"):
        raise ValueError(f"未知关机触发条件：{condition}")
    if not isinstance(trigger, str):
        return False
    if condition == "string_equals":
        return trigger == match_value
    if condition == "string_starts_with":
        return trigger.startswith(match_value)
    if condition == "string_ends_with":
        return trigger.endswith(match_value)
    return match_value in trigger


class CAP_WindowsShutdown:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "trigger": ("*", {"forceInput": True, "tooltip": "必须连接上游输出，可接任意类型。循环工作流建议连接循环结束节点的输出。"}),
            "enabled": ("BOOLEAN", {"default": True, "tooltip": "开启后登记关机请求，等待当前工作流成功完成且整个队列为空，再强制关闭 Windows。"}),
            "condition": (["always", "number_equals", "string_equals", "string_starts_with", "string_ends_with", "string_includes"],
                          {"default": "always", "tooltip": "always：执行到节点就登记；其余模式仅在 trigger 与 match_value 匹配时登记。"}),
            "delay_seconds": ("INT", {"default": 60, "min": 0, "max": 86400, "tooltip": "完成后的关机倒计时。0 为立即关机；倒计时内可运行 shutdown /a 取消。"}),
        }, "optional": {
            "match_value": ("STRING", {"default": "", "tooltip": "比较目标，例如数字 20 或字符串 done。always 忽略此项；字符串区分大小写，不去除空格。"}),
        }}

    RETURN_TYPES = ()
    FUNCTION = "arm_shutdown"
    CATEGORY = "Capricorncd"
    OUTPUT_NODE = True
    DESCRIPTION = "必须连接 trigger。开关默认开启。默认执行到节点就登记关机；也可设置数字等于或字符串匹配条件。登记后等待工作流成功完成及整个队列清空再强制关机。"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def arm_shutdown(self, trigger, enabled, condition, delay_seconds, match_value=""):
        if not enabled or not _matches_condition(trigger, condition, match_value):
            return ()
        if os.name != "nt":
            raise RuntimeError("此关机节点仅支持 Windows。")
        if type(delay_seconds) is not int or not 0 <= delay_seconds <= 86400:
            raise ValueError("delay_seconds 必须是 0 到 86400 之间的整数。")
        context = get_executing_context()
        if context is None:
            raise RuntimeError("关机节点必须在工作流执行过程中运行。")
        global _controller
        if _controller is None:
            _controller = ShutdownController(PromptServer.instance.prompt_queue)
        _controller.arm(context.prompt_id, delay_seconds)
        return ()


NODE_CLASS_MAPPINGS = {"CAP_WindowsShutdown": CAP_WindowsShutdown}
NODE_DISPLAY_NAME_MAPPINGS = {"CAP_WindowsShutdown": "工作流完成后强制关机 (Windows)"}
