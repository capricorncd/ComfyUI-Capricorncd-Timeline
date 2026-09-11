import math


def playback_rate(value=1):
    try:
        rate = float(value)
    except (TypeError, ValueError):
        return 1.0
    return max(0.25, min(4.0, rate)) if math.isfinite(rate) and rate > 0 else 1.0


def audio_speed_filter(rate):
    rate = playback_rate(rate)
    if rate == 1:
        return ""
    return f",aresample=48000,asetrate={round(48000 * rate)},aresample=48000"
