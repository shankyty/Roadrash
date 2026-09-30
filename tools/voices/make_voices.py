"""Rebuild web/voices.js: the spoken curses and hawker calls.

Each entry in lines.json has the bubble text (`line`), what the voice actually says (`say`, native
script; hawker calls stretch the key vowel), the language model to use and the take (`seed`) that
was picked as the clearest. Voices come from Meta's MMS-TTS models (CC BY-NC 4.0).

  python3 -m venv .venv && .venv/bin/pip install torch transformers scipy numpy
  .venv/bin/python make_voices.py          # needs ffmpeg on PATH
"""
import base64, hashlib, json, os, re, subprocess, tempfile
import numpy as np
import scipy.io.wavfile as wav
import torch
from transformers import AutoTokenizer, VitsModel

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_JS = os.path.join(HERE, "..", "..", "web", "voices.js")

# curses: normal pace, then pitched up, squashed and clipped into a shout
# hawkers: slower, a breath between phrases, vibrato and a little street echo
STYLE = {
    "curse": dict(rate=1.05, noise=0.8, gap=0.09, fx=(
        "asetrate=17280,aresample=16000,highpass=f=140,"
        "acompressor=threshold=-26dB:ratio=8:attack=4:release=60:makeup=6,asoftclip=type=tanh,"
        "equalizer=f=2800:t=q:w=1.2:g=5,loudnorm=I=-13:TP=-1:LRA=5,aresample=22050")),
    "hawker": dict(rate=0.9, noise=0.7, gap=0.28, fx=(
        "highpass=f=100,vibrato=f=5.2:d=0.12,equalizer=f=1800:t=q:w=1.4:g=2,aecho=0.85:0.6:70:0.18,"
        "areverse,afade=t=in:d=0.3,areverse,loudnorm=I=-17:TP=-1.5:LRA=7,aresample=22050")),
}
TRIM = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,"

models = {lang: (AutoTokenizer.from_pretrained(f"facebook/mms-tts-{lang}"), VitsModel.from_pretrained(f"facebook/mms-tts-{lang}").eval())
          for lang in ("hin", "tam")}


def synth(lang, text, rate, noise):
    tok, model = models[lang]
    model.speaking_rate, model.noise_scale = rate, noise
    with torch.no_grad():
        return model(**tok(text, return_tensors="pt")).waveform[0].numpy(), model.config.sampling_rate


def voiced(w, sr):
    """drop the silence the model pads around each phrase"""
    win = sr // 50
    env = np.array([np.sqrt(np.mean(w[i:i + win] ** 2)) for i in range(0, max(1, len(w) - win), win)])
    loud = np.where(20 * np.log10(env + 1e-9) > 20 * np.log10(env.max() + 1e-9) - 38)[0]
    return w[max(0, loud[0] * win - win * 2): min(len(w), (loud[-1] + 1) * win + win * 3)] if len(loud) else w


clips = {}
with tempfile.TemporaryDirectory() as tmp:
    for e in json.load(open(os.path.join(HERE, "lines.json"))):
        st = STYLE[e["kind"]]
        torch.manual_seed(e["seed"])
        chunks, sr = [], 16000
        for phrase in [p.strip() for p in re.split(r"[!?,.…]+", e["say"]) if p.strip()]:
            w, sr = synth(e["lang"], phrase, st["rate"], st["noise"])
            chunks += [voiced(w, sr), np.zeros(int(sr * st["gap"]), dtype=np.float32)]
        audio = np.concatenate(chunks[:-1])
        audio = audio / (np.max(np.abs(audio)) + 1e-9) * 0.9
        key = hashlib.md5(e["line"].encode()).hexdigest()[:8]
        src, dst = os.path.join(tmp, key + ".wav"), os.path.join(tmp, key + ".mp3")
        wav.write(src, sr, (audio * 32767).astype(np.int16))
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-af", TRIM + st["fx"],
                        "-ac", "1", "-c:a", "libmp3lame", "-b:a", "40k", dst], check=True)
        clips[e["line"]] = "data:audio/mpeg;base64," + base64.b64encode(open(dst, "rb").read()).decode()
        print(f"{e['kind']:6s} {e['say']}", flush=True)

with open(OUT_JS, "w") as f:
    f.write("// Spoken curses and hawker calls, generated with Meta MMS-TTS (facebook/mms-tts-hin, facebook/mms-tts-tam),\n"
            "// licensed CC BY-NC 4.0 (https://creativecommons.org/licenses/by-nc/4.0/). Regenerate with tools/voices/.\n"
            "window.RRR_VOICES = " + json.dumps(clips, ensure_ascii=False) + ";\n")
print(f"wrote {len(clips)} clips to web/voices.js")
