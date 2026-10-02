"""Rebuild web/voices.js: the spoken curses and hawker calls.

Three sets of clips, each made only when asked for; everything else already in voices.js is kept:

  --rivals [id,id]   each rival driver's own curses (web/drivers.js), in their own voice and language.
                     Clip key "<driver id>|<bubble text>". AI4Bharat Indic Parler-TTS (Apache 2.0): the
                     driver's `voice.describe` is the description prompt, written the way the model was
                     trained ("<Speaker> speaks in a very loud, angry tone with a high pitch ..."). A named
                     speaker is the same voice every time. Takes differ a lot, so unless a `seed` is pinned
                     (on the curse, or on the voice for every line of an unnamed speaker), --takes are made
                     and the highest-pitched one, the most shouted, is kept. A driver's clips for lines
                     that are no longer in the config are dropped.
  --player           your driver's curses (lines.json, kind "curse"), also Indic Parler-TTS.
  --hawkers          the hawker calls (lines.json, kind "hawker"). Meta MMS-TTS (CC BY-NC 4.0); each
                     entry has the take (`seed`) that was picked as the clearest.
  --samples DIR      also write every clip made in this run to DIR as .mp3, to listen to.
  --takes N          takes per unpinned curse (default 3).

In lines.json `line` is the bubble text and `say` what the voice actually says (native script; hawker
calls stretch the key vowel).

  uv venv --python 3.12 .venv && uv pip install -p .venv torch transformers scipy numpy \\
      git+https://github.com/huggingface/parler-tts.git
  .venv/bin/python make_voices.py --rivals          # needs ffmpeg on PATH

Indic Parler-TTS is a gated model: accept its terms at huggingface.co/ai4bharat/indic-parler-tts and
log in (`hf auth login`) first.
"""
import argparse, base64, json, os, re, subprocess, tempfile, zlib
import librosa
import numpy as np
import scipy.io.wavfile as wav
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, "..", "..", "web")
OUT_JS = os.path.join(WEB, "voices.js")
HEADER = ("// Spoken curses and hawker calls. Curses: AI4Bharat Indic Parler-TTS (ai4bharat/indic-parler-tts, Apache 2.0).\n"
          "// Hawker calls: Meta MMS-TTS (facebook/mms-tts-hin, facebook/mms-tts-tam), CC BY-NC 4.0\n"
          "// (https://creativecommons.org/licenses/by-nc/4.0/). Regenerate with tools/voices/.\n")

# curses: squashed and clipped into a shout (the voice itself is the driver's: no pitch shifting)
# hawkers: slower, a breath between phrases, vibrato and a little street echo
SHOUT = ("highpass=f=140,acompressor=threshold=-26dB:ratio=8:attack=4:release=60:makeup=6,asoftclip=type=tanh,"
         "equalizer=f=2800:t=q:w=1.2:g=4,loudnorm=I=-13:TP=-1:LRA=5,aresample=22050")
HAWKER = dict(rate=0.9, noise=0.7, gap=0.28, fx=(
    "highpass=f=100,vibrato=f=5.2:d=0.12,equalizer=f=1800:t=q:w=1.4:g=2,aecho=0.85:0.6:70:0.18,"
    "areverse,afade=t=in:d=0.3,areverse,loudnorm=I=-17:TP=-1.5:LRA=7,aresample=22050"))
TRIM = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
CLEAN = " Very clear audio, very close recording with no background noise."
# your driver: one voice for every city, unlike any rival's
PLAYER_VOICE = ("A young male speaker speaks in a very loud, angry tone with a high pitch and a fast pace, shouting with great "
                "emotional depth. The speech is very expressive and animated.")

args = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
args.add_argument("--rivals", nargs="?", const="all", help="all rival drivers, or a comma-separated list of ids")
args.add_argument("--player", action="store_true")
args.add_argument("--hawkers", action="store_true")
args.add_argument("--samples", metavar="DIR")
args.add_argument("--takes", type=int, default=3)
args = args.parse_args()
if not (args.rivals or args.player or args.hawkers):
    raise SystemExit("nothing to do: pass --rivals, --player and/or --hawkers")


def sliced(path, a, b):
    src = open(path, encoding="utf8").read()
    return json.loads(src[src.index(a):src.rindex(b) + 1])


drivers = sliced(os.path.join(WEB, "drivers.js"), "[", "]")
lines = json.load(open(os.path.join(HERE, "lines.json"), encoding="utf8"))
clips = sliced(OUT_JS, "{", "}") if os.path.exists(OUT_JS) else {}

# ---------------------------------------------------------------- the two voices
_parler = None


def parler(text, description, seed):
    """Indic Parler-TTS: `description` says who is speaking and how; returns (samples, rate)."""
    global _parler
    if _parler is None:
        from parler_tts import ParlerTTSForConditionalGeneration
        from transformers import AutoTokenizer
        name = "ai4bharat/indic-parler-tts"
        model = ParlerTTSForConditionalGeneration.from_pretrained(name).eval()
        _parler = (model, AutoTokenizer.from_pretrained(name), AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path))
    model, tok, desc_tok = _parler
    torch.manual_seed(seed)
    d, p = desc_tok(description, return_tensors="pt"), tok(text, return_tensors="pt")
    with torch.no_grad():
        out = model.generate(input_ids=d.input_ids, attention_mask=d.attention_mask,
                             prompt_input_ids=p.input_ids, prompt_attention_mask=p.attention_mask)
    return out.cpu().numpy().squeeze().astype(np.float32), model.config.sampling_rate


_mms = {}


def mms(lang, text, rate, noise):
    if lang not in _mms:
        from transformers import AutoTokenizer, VitsModel
        _mms[lang] = (AutoTokenizer.from_pretrained(f"facebook/mms-tts-{lang}"), VitsModel.from_pretrained(f"facebook/mms-tts-{lang}").eval())
    tok, model = _mms[lang]
    model.speaking_rate, model.noise_scale = rate, noise
    with torch.no_grad():
        return model(**tok(text, return_tensors="pt")).waveform[0].numpy(), model.config.sampling_rate


def voiced(w, sr):
    """drop the silence the model pads around each phrase"""
    win = sr // 50
    env = np.array([np.sqrt(np.mean(w[i:i + win] ** 2)) for i in range(0, max(1, len(w) - win), win)])
    loud = np.where(20 * np.log10(env + 1e-9) > 20 * np.log10(env.max() + 1e-9) - 38)[0]
    return w[max(0, loud[0] * win - win * 2): min(len(w), (loud[-1] + 1) * win + win * 3)] if len(loud) else w


# ---------------------------------------------------------------- what to make: (key, label, audio maker, fx)
def shouted(text, description, seeds):
    """the take that sits highest in pitch (a shout does), among those of a sensible length"""
    takes = []
    for seed in seeds:
        a, sr = parler(text, description, seed)
        f0, ok, _ = librosa.pyin(a, fmin=60, fmax=500, sr=sr)
        f0 = f0[ok & ~np.isnan(f0)]
        takes.append((float(np.median(f0)) if len(f0) > 4 else 0.0, len(a) / sr, a, sr))
    mid = float(np.median([t[1] for t in takes]))
    sane = [t for t in takes if 0.6 * mid <= t[1] <= 1.6 * mid] or takes
    best = max(sane, key=lambda t: t[0])
    return best[2], best[3]


jobs = []
if args.rivals:
    want = None if args.rivals == "all" else set(args.rivals.split(","))
    unknown = (want or set()) - {d["id"] for d in drivers}
    if unknown:
        raise SystemExit(f"no such driver: {', '.join(sorted(unknown))}")
    for d in drivers:
        if want and d["id"] not in want:
            continue
        keep = {f"{d['id']}|{c['text']}" for c in d["curses"]}
        for stale in [k for k in clips if k.startswith(d["id"] + "|") and k not in keep]:
            del clips[stale]
        for c in d["curses"]:
            key = f"{d['id']}|{c['text']}"
            pinned = c.get("seed", d["voice"].get("seed"))
            base = zlib.crc32(key.encode()) % 100000   # the same line always gets the same takes
            seeds = [pinned] if pinned is not None else [base + k for k in range(args.takes)]
            jobs.append((key, f"{d['id']:8s} {c['say']}", lambda c=c, d=d, seeds=seeds: shouted(c["say"], d["voice"]["describe"] + CLEAN, seeds), SHOUT))
for e in lines:
    if e["kind"] == "curse" and args.player:
        jobs.append((e["line"], f"player   {e['say']}", lambda e=e: parler(e["say"], PLAYER_VOICE + CLEAN, e["seed"]), SHOUT))
    if e["kind"] == "hawker" and args.hawkers:
        def hawk(e=e):
            torch.manual_seed(e["seed"])
            chunks, sr = [], 16000
            for phrase in [p.strip() for p in re.split(r"[!?,.…]+", e["say"]) if p.strip()]:
                w, sr = mms(e["lang"], phrase, HAWKER["rate"], HAWKER["noise"])
                chunks += [voiced(w, sr), np.zeros(int(sr * HAWKER["gap"]), dtype=np.float32)]
            return np.concatenate(chunks[:-1]), sr
        jobs.append((e["line"], f"hawker   {e['say']}", hawk, HAWKER["fx"]))

if args.samples:
    os.makedirs(args.samples, exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    for n, (key, label, make, fx) in enumerate(jobs):
        audio, sr = make()
        audio = audio / (np.max(np.abs(audio)) + 1e-9) * 0.9
        src, dst = os.path.join(tmp, f"{n}.wav"), os.path.join(tmp, f"{n}.mp3")
        wav.write(src, sr, (audio * 32767).astype(np.int16))
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-af", TRIM + fx,
                        "-ac", "1", "-c:a", "libmp3lame", "-b:a", "40k", dst], check=True)
        mp3 = open(dst, "rb").read()
        clips[key] = "data:audio/mpeg;base64," + base64.b64encode(mp3).decode()
        if args.samples:
            open(os.path.join(args.samples, re.sub(r"[^A-Za-z0-9|]+", "_", key).strip("_").replace("|", "-") + ".mp3"), "wb").write(mp3)
        print(f"{n + 1:3d}/{len(jobs)} {label}", flush=True)

with open(OUT_JS, "w", encoding="utf8") as f:
    f.write(HEADER + "window.RRR_VOICES = " + json.dumps(clips, ensure_ascii=False) + ";\n")
print(f"made {len(jobs)} clips; web/voices.js now has {len(clips)}")
