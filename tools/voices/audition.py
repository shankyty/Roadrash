"""Audition takes of the rival drivers' curses, to pick the angry ones by ear.

Indic Parler-TTS only shouts now and then, and nothing measurable tells an angry take from a flat one, so
each line gets several candidates (two kinds of voice x a few seeds) and a person chooses. Writes
samples/audition/audition.html: every line with its current clip and the candidates, a choice per line, and
a box with the picks to paste back. A pick becomes that curse's `describe` and `seed` in web/drivers.js.

  .venv/bin/python audition.py [driver ids...]     # default: every driver; made clips are reused
"""
import base64, html, json, os, re, subprocess, sys
import numpy as np
import scipy.io.wavfile as wav
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, "..", "..", "web")
OUT = os.path.join(HERE, "samples", "audition")
SHOUT = ("highpass=f=140,acompressor=threshold=-26dB:ratio=8:attack=4:release=60:makeup=6,asoftclip=type=tanh,"
         "equalizer=f=2800:t=q:w=1.2:g=4,loudnorm=I=-13:TP=-1:LRA=5,aresample=22050")
TRIM = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
CLEAN = " Very clear audio, very close recording with no background noise."
ANGRY = "{who} speaks in a very loud, angry tone with a high pitch and a fast pace, shouting with great emotional depth. The speech is very expressive and animated."
# the kinds of voice to try (an unnamed speaker shouts more readily than the model's named ones)
WHO = {
    "deep": "A male speaker with a deep voice",
    "raspy": "An old male speaker with a rough, raspy voice",
    "gruff": "A middle-aged male speaker with a gruff, booming voice",
    "nasal": "A young male speaker with a sharp, nasal voice",
    "shrill": "A middle-aged female speaker with a sharp, shrill voice",
    "sanjay": "Sanjay", "neha": "Neha",
}
SEEDS = [23, 11, 77]
VOICES = {  # two kinds of voice per driver
    "ganpat": ["sanjay", "gruff"], "bunty": ["deep", "gruff"], "saleem": ["raspy", "nasal"], "murugan": ["deep", "gruff"],
    "bablu": ["raspy", "nasal"], "jassi": ["deep", "gruff"], "jintu": ["nasal", "deep"], "banwari": ["gruff", "nasal"],
    "manju": ["nasal", "deep"], "nawab": ["raspy", "deep"], "bhola": ["gruff", "raspy"], "lallan": ["gruff", "deep"],
    "kokila": ["shrill", "neha"],
}
# already picked by ear: (kind of voice, seed)
APPROVED = {
    "ganpat|DIMAAG KHARAB HAI KYA?!": ("sanjay", 11), "jassi|TERI AISI KI TAISI!": ("deep", 23), "jassi|KI KARDA PAYA?!": ("deep", 23),
    "bunty|ABEY OYE!": ("deep", 23), "bunty|BADTAMEEZ!": ("deep", 23), "nawab|AREY HUZOOR, TAMEEZ SE!": ("raspy", 23),
}


def describe(kind):
    return ANGRY.format(who=WHO[kind])


def sliced(path, a, b):
    src = open(path, encoding="utf8").read()
    return json.loads(src[src.index(a):src.rindex(b) + 1])


if __name__ == "__main__":
    drivers = sliced(os.path.join(WEB, "drivers.js"), "[", "]")
    clips = sliced(os.path.join(WEB, "voices.js"), "{", "}")
    want = set(sys.argv[1:])
    os.makedirs(OUT, exist_ok=True)
    model = None

    def take(text, kind, seed, path):
        global model, tok, dtok
        if os.path.exists(path):
            return
        if model is None:
            from parler_tts import ParlerTTSForConditionalGeneration
            from transformers import AutoTokenizer
            name = "ai4bharat/indic-parler-tts"
            model = ParlerTTSForConditionalGeneration.from_pretrained(name).eval()
            tok, dtok = AutoTokenizer.from_pretrained(name), AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path)
        torch.manual_seed(seed)
        d, p = dtok(describe(kind) + CLEAN, return_tensors="pt"), tok(text, return_tensors="pt")
        with torch.no_grad():
            out = model.generate(input_ids=d.input_ids, attention_mask=d.attention_mask, prompt_input_ids=p.input_ids, prompt_attention_mask=p.attention_mask)
        a = np.atleast_1d(out.cpu().numpy().squeeze()).astype(np.float32)
        sr = model.config.sampling_rate
        if len(a) < sr * 0.25:   # the model said nothing: leave no candidate
            return
        a = a / (np.max(np.abs(a)) + 1e-9) * 0.9
        wav.write(path + ".wav", sr, (a * 32767).astype(np.int16))
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path + ".wav", "-af", TRIM + SHOUT,
                        "-ac", "1", "-c:a", "libmp3lame", "-b:a", "40k", path], check=True)
        os.remove(path + ".wav")

    uri = lambda path: "data:audio/mpeg;base64," + base64.b64encode(open(path, "rb").read()).decode()
    page = ["<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Audition: rival voices</title>",
            "<style>body{font:15px system-ui,sans-serif;margin:16px;background:#14161a;color:#eee;max-width:1000px}h2{margin:26px 0 4px;font-size:18px}"
            ".line{border-top:1px solid #333;padding:10px 0}.t{font-weight:600}.s{color:#9aa;font-weight:400}.c{display:flex;align-items:center;gap:8px;margin:4px 0}"
            ".c span{min-width:110px;color:#cde}audio{height:30px}.ok{color:#8fd694}textarea{width:100%;height:160px;background:#0c0d10;color:#eee;font:13px ui-monospace,monospace}"
            "button{font:15px system-ui;padding:8px 14px;margin:14px 0}</style>",
            "<h1 style='font-size:21px'>Pick the angry take for each line</h1><p>Play the candidates and choose one per line, or “none are angry”. "
            "Try to keep to one kind of voice per driver (deep, raspy, gruff…) so they sound like one person. Then press the button at the bottom and paste the box back to Claude.</p>"]
    n = 0
    for d in drivers:
        if want and d["id"] not in want:
            continue
        page.append(f"<h2>{html.escape(d['name'])} · {html.escape(d['cityName'])}</h2>")
        for c in d["curses"]:
            key = f"{d['id']}|{c['text']}"
            page.append(f"<div class=line><div class=t>{html.escape(c['text'])} <span class=s>{html.escape(c['say'])}</span></div>")
            if key in APPROVED:
                page.append(f"<div class='c ok'>already picked: {APPROVED[key][0]}, seed {APPROVED[key][1]}</div></div>")
                continue
            opts = [("current", clips.get(key))]
            for kind in VOICES[d["id"]]:
                for seed in SEEDS:
                    path = os.path.join(OUT, re.sub(r"[^A-Za-z0-9]+", "_", key).strip("_") + f"--{kind}-s{seed}.mp3")
                    take(c["say"], kind, seed, path)
                    n += 1
                    print(f"{n:4d} {key} {kind} s{seed}", flush=True)
                    opts.append((f"{kind}-s{seed}", uri(path) if os.path.exists(path) else None))
            for label, src in opts:
                if src:
                    page.append(f"<label class=c><input type=radio name='{html.escape(key, quote=True)}' value='{label}'><span>{label}</span><audio controls preload=none src='{src}'></audio></label>")
            page.append(f"<label class=c><input type=radio name='{html.escape(key, quote=True)}' value='none'><span>none are angry</span></label></div>")
    page.append("<button onclick='show()'>Show my picks</button><textarea id=out readonly placeholder='your picks appear here'></textarea>"
                "<script>function show(){const p={};document.querySelectorAll('input[type=radio]:checked').forEach(r=>p[r.name]=r.value);"
                "const t=document.getElementById('out');t.value=JSON.stringify(p,null,1);t.select();try{navigator.clipboard.writeText(t.value)}catch(e){}}</script>")
    open(os.path.join(OUT, "audition.html"), "w", encoding="utf8").write("\n".join(page))
    print("wrote", os.path.join(OUT, "audition.html"))
