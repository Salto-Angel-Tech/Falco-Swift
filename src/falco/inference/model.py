import json
import math
from pathlib import Path

import torch
from torch import nn
from transformers import AutoModel, AutoTokenizer

from falco.questions.schema import normalize_state, options_of, text_question, validate_question


def choice_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


class SystemOne(nn.Module):
    def __init__(self, model_base: str | None = None, encoder=None):
        super().__init__()
        self.encoder = (
            encoder
            if encoder is not None
            else AutoModel.from_pretrained(model_base, dtype=torch.float32)
        )
        hidden = self.encoder.config.hidden_size
        self.head = nn.Sequential(nn.Dropout(0.1), nn.Linear(hidden, 1))
        self.register_buffer("temperature", torch.ones(1))

    def forward(self, input_ids, attention_mask):
        output = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        cls = output.last_hidden_state[:, 0]
        return self.head(cls).squeeze(-1)

    def save(self, folder, tokenizer, max_len: int) -> None:
        path = Path(folder)
        path.mkdir(parents=True, exist_ok=True)
        self.encoder.save_pretrained(path / "encoder")
        tokenizer.save_pretrained(path / "encoder")
        torch.save(
            {"head": self.head.state_dict(), "temperature": self.temperature.cpu()},
            path / "head.pt",
        )
        (path / "config.json").write_text(
            json.dumps({"max_len": max_len, "temperature": float(self.temperature)})
        )

    @classmethod
    def load(cls, folder):
        path = Path(folder)
        model = cls(encoder=AutoModel.from_pretrained(path / "encoder", dtype=torch.float32))
        checkpoint = torch.load(path / "head.pt", map_location="cpu")
        model.head.load_state_dict(checkpoint["head"])
        model.temperature.copy_(checkpoint["temperature"])
        tokenizer = AutoTokenizer.from_pretrained(path / "encoder")
        config = json.loads((path / "config.json").read_text())
        return model, tokenizer, config


def tokenizer_method(tokenizer, pairs, max_len: int) -> dict:
    states, texts = zip(*pairs, strict=True)
    enc = tokenizer(
        list(states),
        list(texts),
        truncation="only_first",
        max_length=max_len,
        padding=True,
        return_tensors="pt",
    )
    return {"input_ids": enc["input_ids"], "attention_mask": enc["attention_mask"]}


def log_probs_by_group(logits, sizes, temperature=1.0):
    return [torch.log_softmax(g / temperature, dim=-1) for g in torch.split(logits, sizes)]


def entropy_normalize(probs: list[float]) -> float:
    if len(probs) < 2:
        return 0.0
    h = -sum(p * math.log(p) for p in probs if p > 0)  # a confident softmax can underflow to 0.0
    return h / math.log(len(probs))


class Classifier:
    def __init__(self, folder: str, device: str | None = None):
        self.device = device or choice_device()
        self.model, self.tokenizer, self.config = SystemOne.load(folder)
        self.model.to(self.device).eval()
        self.max_len = self.config["max_len"]

    @torch.no_grad()
    def prediction(self, state, questions: dict) -> dict:
        if not questions:
            return {}
        state = normalize_state(state)
        names, pairs, sizes = [], [], []
        for name, question in questions.items():
            validate_question(name, question)
            options = options_of(question)
            names.append(name)
            sizes.append(len(options))
            pairs += [
                (state, text_question(question["type"], question["instructions"], o))
                for o in options
            ]
        enc = {
            k: v.to(self.device)
            for k, v in tokenizer_method(self.tokenizer, pairs, self.max_len).items()
        }
        logits = self.model(**enc).float()
        groups = log_probs_by_group(logits, sizes, temperature=self.config.get("temperature", 1.0))

        result = {}

        for name, log_probs in zip(names, groups, strict=True):
            question = questions[name]
            options = options_of(question)
            p = log_probs.exp().cpu().tolist()
            confidence = round(1 - entropy_normalize(p), 4)
            distribution = {o: round(pi, 4) for o, pi in zip(options, p, strict=True)}

            if question["type"] == "noul":
                result[name] = {"type": "noul", "noul": round(p[0], 4)}
            elif question["type"] == "choice":
                best = max(range(len(p)), key=p.__getitem__)
                result[name] = {
                    "type": "choice",
                    "choice": options[best],
                    "probability": distribution,
                    "confidence": confidence,
                }
            else:
                score = sum(i * pi for i, pi in enumerate(p)) / (len(p) - 1)
                result[name] = {
                    "type": "score",
                    "score": round(score, 4),
                    "distribution": distribution,
                    "confidence": confidence,
                }

        return result
