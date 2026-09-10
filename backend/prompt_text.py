def strip_comment_lines(text: str) -> str:
    return "\n".join(
        line for line in str(text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
        if not line.lstrip().startswith("#")
    )
