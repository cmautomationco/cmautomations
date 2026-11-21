"""
Kokoro text-to-speech for the VSL voice track (free, open-source, natural-sounding).

Reads JSON on stdin: {"model": ".../kokoro-v1.0.onnx", "voices": ".../voices-v1.0.bin",
"voice": "bm_george:0.65,bm_lewis:0.35", "speed": 0.96, "lang": "en-gb",
"lines": [{"text": "...", "file": "out.wav"}]}

A voice can be one Kokoro voice ("bm_george") or a blend of several with weights,
which gives a voice of its own rather than a stock one people may recognise.
Each line is spoken as one take, so sentences never break up in the middle.
"""
import json
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro


def style_for(kokoro, spec):
    parts = [p.strip() for p in spec.split(",") if p.strip()]
    if len(parts) == 1 and ":" not in parts[0]:
        return parts[0]
    total = 0.0
    mix = None
    for p in parts:
        name, _, weight = p.partition(":")
        w = float(weight or 1)
        style = kokoro.get_voice_style(name) * w
        mix = style if mix is None else mix + style
        total += w
    return mix / total


def main():
    job = json.load(sys.stdin)
    kokoro = Kokoro(job["model"], job["voices"])
    voice = style_for(kokoro, job["voice"])
    for line in job["lines"]:
        samples, rate = kokoro.create(line["text"], voice=voice, speed=float(job.get("speed", 1.0)), lang=job.get("lang", "en-gb"))
        # Trim the silence Kokoro leaves at either end, keeping a short natural breath.
        loud = np.where(np.abs(samples) > 0.01)[0]
        if len(loud):
            pad = int(rate * 0.06)
            samples = samples[max(0, loud[0] - pad): min(len(samples), loud[-1] + pad)]
        sf.write(line["file"], samples, rate)
        print(line["file"], flush=True)


if __name__ == "__main__":
    main()
