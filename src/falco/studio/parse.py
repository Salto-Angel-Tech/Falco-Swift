"""Turn the plain print() progress lines of tag.py and train.py into structured events.

Pure functions only: no I/O, no torch. Each parser is fed one output line at a time
and returns an event dict, or None when the line carries no recognised progress.
The regular expressions mirror the exact f-strings printed by tag.py and train.py.
"""

import ast
import re
from collections.abc import Callable

# ---------- tag.py ----------

_TAG_PATTERNS: list[tuple[re.Pattern, Callable[[re.Match], dict]]] = [
    (
        re.compile(r"^Generating (\d+) synthetic states\.\.\.$"),
        lambda m: {"type": "generating", "total": int(m[1])},
    ),
    (
        re.compile(r"^  generated (\d+)/(\d+)$"),
        lambda m: {"type": "generated", "n": int(m[1]), "total": int(m[2])},
    ),
    (
        re.compile(r"^  batch discarded \((\d+)/(\d+)\): (.*)$"),
        lambda m: {"type": "discarded", "attempt": int(m[1]), "max": int(m[2]), "error": m[3]},
    ),
    (
        re.compile(r"^  giving up on generation with (\d+)/(\d+) states$"),
        lambda m: {"type": "gave_up", "generated": int(m[1]), "total": int(m[2])},
    ),
    (
        re.compile(r"^Labelling (\d+) states \((\d+) already in (.*)\)\.\.\.$"),
        lambda m: {
            "type": "labelling",
            "pending": int(m[1]),
            "already": int(m[2]),
            "output": m[3],
        },
    ),
    (
        re.compile(r"^  failed: (.*)$"),
        lambda m: {"type": "failed", "error": m[1]},
    ),
    (
        re.compile(r"^  warning: (.*)$"),
        lambda m: {"type": "warning", "message": m[1]},
    ),
    (
        re.compile(r"^  (\d+)/(\d+)$"),
        lambda m: {"type": "progress", "done": int(m[1]), "total": int(m[2])},
    ),
    (
        re.compile(r"^Done: (\d+) states labelled, (\d+) failed -> (.*)$"),
        lambda m: {"type": "done", "ok": int(m[1]), "failed": int(m[2]), "output": m[3]},
    ),
]


def _clean(line: str) -> str:
    return line.rstrip("\r\n")


def _match(patterns, line: str) -> dict | None:
    for pattern, build in patterns:
        match = pattern.match(line)
        if match:
            return build(match)
    return None


def _literal_dict(text: str) -> dict | None:
    """Parse the Python dict repr printed by train.py; None when it is not a dict."""
    try:
        value = ast.literal_eval(text.strip())
    except (ValueError, SyntaxError):
        return None
    return value if isinstance(value, dict) else None


class TagParser:
    """Stateless parser for tag.py output."""

    def feed(self, line: str) -> dict | None:
        return _match(_TAG_PATTERNS, _clean(line))


# ---------- train.py ----------

_DEVICE = re.compile(r"^Device: (\S+) \| train: (\d+) \| validation: (\d+)$")
_DROPPED = re.compile(r"^  (\d+) unusable rows ignored$")
_STEP = re.compile(r"^  epoch (\d+) step (\d+)/(\d+) loss ([0-9.eE+-]+|nan|inf)$")
_EPOCH = re.compile(r"^Epoch (\d+): validation (\{.*\})$")
_SAVED = re.compile(r"^  saved \(best so far\) in (.*?)/?$")
_CALIBRATION = re.compile(r"^Calibration: temperature=([0-9.eE+-]+|nan|inf)$")
_BEFORE = re.compile(r"^  before: (\{.*\})$")
_AFTER = re.compile(r"^  after:  (\{.*\})$")
_FINAL = re.compile(r"^Final model in (.*)$")
_WARNING = re.compile(r"^  warning: (.*)$")


class TrainParser:
    """Parser for train.py output. Stateful: calibration spans three lines."""

    def __init__(self):
        self._calibration: dict | None = None

    def feed(self, line: str) -> dict | None:
        line = _clean(line)
        if match := _DEVICE.match(line):
            return {
                "type": "device",
                "device": match[1],
                "train": int(match[2]),
                "validation": int(match[3]),
            }
        if match := _DROPPED.match(line):
            return {"type": "dropped", "n": int(match[1])}
        if match := _STEP.match(line):
            return {
                "type": "step",
                "epoch": int(match[1]),
                "step": int(match[2]),
                "total": int(match[3]),
                "loss": float(match[4]),
            }
        if match := _EPOCH.match(line):
            metrics = _literal_dict(match[2])
            if metrics is None:
                return None
            return {
                "type": "epoch",
                "epoch": int(match[1]),
                "loss": metrics.get("loss"),
                "accuracy": metrics.get("accuracy"),
                "ece": metrics.get("ece"),
                "n": metrics.get("n"),
            }
        if match := _SAVED.match(line):
            return {"type": "saved", "path": match[1]}
        if match := _CALIBRATION.match(line):
            self._calibration = {"type": "calibration", "temperature": float(match[1])}
            return None
        if match := _BEFORE.match(line):
            if self._calibration is not None:
                self._calibration["before"] = _literal_dict(match[1])
            return None
        if match := _AFTER.match(line):
            if self._calibration is None:
                return None
            event = {**self._calibration, "after": _literal_dict(match[1])}
            event.setdefault("before", None)
            self._calibration = None
            return event
        if match := _FINAL.match(line):
            return {"type": "final", "path": match[1]}
        if match := _WARNING.match(line):
            return {"type": "warning", "message": match[1]}
        return None


def parser_for(kind: str) -> TagParser | TrainParser:
    """A fresh parser for a job kind ("tag" or "train")."""
    if kind == "tag":
        return TagParser()
    if kind == "train":
        return TrainParser()
    raise ValueError(f"unknown job kind: {kind!r}")
