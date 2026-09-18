import os
import subprocess
import sys


def reveal_file(path):
    path = os.path.abspath(path)
    if sys.platform == "win32":
        subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass",
             "-File", os.path.join(os.path.dirname(__file__), "reveal_file.ps1")],
            input=path.encode("utf-8"), capture_output=True,
            creationflags=subprocess.CREATE_NO_WINDOW, check=True, timeout=20,
        )
    elif sys.platform == "darwin":
        subprocess.Popen(["open", "-R", path])
    else:
        subprocess.Popen(["xdg-open", os.path.dirname(path)])
