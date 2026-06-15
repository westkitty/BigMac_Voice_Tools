import json
import os
import time
from pathlib import Path

BASE = Path(__file__).resolve().parent
VOICE_ROOT = BASE.parent
CACHE_ROOT = VOICE_ROOT / ".cache"
OUT = BASE / "outputs"
OUT.mkdir(exist_ok=True)

os.environ.setdefault("HF_HOME", str(CACHE_ROOT / "huggingface"))
os.environ.setdefault("HUGGINGFACE_HUB_CACHE", str(CACHE_ROOT / "huggingface" / "hub"))
os.environ.setdefault("TORCH_HOME", str(CACHE_ROOT / "torch"))
os.environ.setdefault("XDG_CACHE_HOME", str(CACHE_ROOT / "xdg"))

import torch
import torchaudio as ta
from chatterbox.tts import ChatterboxTTS

try:
    from chatterbox.tts_turbo import ChatterboxTurboTTS
except Exception:
    ChatterboxTurboTTS = None

payload = json.loads(input())
text = payload["text"].strip()
reference_audio = payload["reference_audio"]
model_kind = payload.get("model_kind") or "Standard"
exaggeration = float(payload.get("exaggeration", 0.5))
cfg_weight = float(payload.get("cfg_weight", 0.5))

device = "mps" if torch.backends.mps.is_available() else "cpu"
if device == "mps":
    torch_load_original = torch.load

    def patched_torch_load(*args, **kwargs):
        if "map_location" not in kwargs:
            kwargs["map_location"] = torch.device("mps")
        return torch_load_original(*args, **kwargs)

    torch.load = patched_torch_load

cls = ChatterboxTTS
if model_kind == "Turbo" and ChatterboxTurboTTS is not None:
    cls = ChatterboxTurboTTS
elif model_kind == "Turbo":
    model_kind = "Standard"

try:
    model = cls.from_pretrained(device=device)
except TypeError:
    model = cls.from_pretrained(device)

if model_kind == "Turbo":
    wav = model.generate(text, audio_prompt_path=reference_audio)
else:
    wav = model.generate(
        text,
        audio_prompt_path=reference_audio,
        exaggeration=exaggeration,
        cfg_weight=cfg_weight,
    )

if hasattr(wav, "detach"):
    wav = wav.detach().cpu()
if hasattr(wav, "dim") and wav.dim() == 1:
    wav = wav.unsqueeze(0)

stamp = time.strftime("%Y%m%d-%H%M%S")
out_path = OUT / f"wrapper-{model_kind.lower()}-{stamp}.wav"
ta.save(str(out_path), wav, model.sr)
print(json.dumps({"ok": True, "output_path": str(out_path), "model": model_kind, "device": device}))
