import pytest

from falco.studio.parse import TagParser, TrainParser, parser_for

# ---------- tag.py ----------


@pytest.mark.parametrize(
    ("line", "event"),
    [
        ("Generating 200 synthetic states...", {"type": "generating", "total": 200}),
        ("  generated 25/200", {"type": "generated", "n": 25, "total": 200}),
        (
            "  batch discarded (2/5): no JSON found in the reply",
            {"type": "discarded", "attempt": 2, "max": 5, "error": "no JSON found in the reply"},
        ),
        (
            "  giving up on generation with 40/200 states",
            {"type": "gave_up", "generated": 40, "total": 200},
        ),
        (
            "Labelling 180 states (20 already in data.jsonl)...",
            {"type": "labelling", "pending": 180, "already": 20, "output": "data.jsonl"},
        ),
        (
            "  failed: ValueError: expected a JSON object, got list",
            {"type": "failed", "error": "ValueError: expected a JSON object, got list"},
        ),
        (
            '  warning: the teacher skipped "urgent"',
            {"type": "warning", "message": 'the teacher skipped "urgent"'},
        ),
        ("  150/180", {"type": "progress", "done": 150, "total": 180}),
        (
            "Done: 178 states labelled, 2 failed -> data.jsonl",
            {"type": "done", "ok": 178, "failed": 2, "output": "data.jsonl"},
        ),
    ],
)
def test_tag_parser_recognises_every_progress_line(line, event):
    assert TagParser().feed(line) == event


def test_tag_parser_ignores_trailing_newlines():
    assert TagParser().feed("  generated 5/10\r\n") == {"type": "generated", "n": 5, "total": 10}


@pytest.mark.parametrize("line", ["", "Traceback (most recent call last):", "random noise 3/4x"])
def test_tag_parser_returns_none_for_unknown_lines(line):
    assert TagParser().feed(line) is None


# ---------- train.py ----------


@pytest.mark.parametrize(
    ("line", "event"),
    [
        ("  3 unusable rows ignored", {"type": "dropped", "n": 3}),
        (
            "Device: cuda | train: 900 | validation: 100",
            {"type": "device", "device": "cuda", "train": 900, "validation": 100},
        ),
        (
            "  epoch 2 step 50/120 loss 0.6931",
            {"type": "step", "epoch": 2, "step": 50, "total": 120, "loss": 0.6931},
        ),
        (
            "Epoch 1: validation {'loss': 0.5123, 'accuracy': 0.81, 'ece': 0.042, 'n': 100}",
            {"type": "epoch", "epoch": 1, "loss": 0.5123, "accuracy": 0.81, "ece": 0.042, "n": 100},
        ),
        (
            "Epoch 3: validation {'loss': None, 'accuracy': None, 'ece': None, 'n': 0}",
            {"type": "epoch", "epoch": 3, "loss": None, "accuracy": None, "ece": None, "n": 0},
        ),
        ("  saved (best so far) in model_s1/", {"type": "saved", "path": "model_s1"}),
        (
            "Final model in C:\\models\\model_s1",
            {"type": "final", "path": "C:\\models\\model_s1"},
        ),
        (
            "  warning: temperature fit diverged, keeping 1.0",
            {"type": "warning", "message": "temperature fit diverged, keeping 1.0"},
        ),
    ],
)
def test_train_parser_recognises_every_progress_line(line, event):
    assert TrainParser().feed(line) == event


def test_train_parser_emits_calibration_once_after_the_after_line():
    parser = TrainParser()
    before = "{'loss': 0.6, 'accuracy': 0.8, 'ece': 0.09, 'n': 100}"
    after = "{'loss': 0.55, 'accuracy': 0.8, 'ece': 0.03, 'n': 100}"

    assert parser.feed("Calibration: temperature=1.502") is None
    assert parser.feed(f"  before: {before}") is None
    event = parser.feed(f"  after:  {after}")

    assert event == {
        "type": "calibration",
        "temperature": 1.502,
        "before": {"loss": 0.6, "accuracy": 0.8, "ece": 0.09, "n": 100},
        "after": {"loss": 0.55, "accuracy": 0.8, "ece": 0.03, "n": 100},
    }
    assert parser.feed(f"  after:  {after}") is None


def test_train_parser_ignores_before_after_lines_without_calibration_header():
    assert TrainParser().feed("  before: {'loss': 0.6}") is None


def test_train_parser_survives_a_malformed_validation_dict():
    assert TrainParser().feed("Epoch 1: validation {broken") is None


@pytest.mark.parametrize("line", ["", "Some weights of the model were not initialized", "  1/2"])
def test_train_parser_returns_none_for_unknown_lines(line):
    assert TrainParser().feed(line) is None


def test_parser_for_returns_a_fresh_parser_per_kind():
    assert isinstance(parser_for("tag"), TagParser)
    assert isinstance(parser_for("train"), TrainParser)
    with pytest.raises(ValueError):
        parser_for("serve")
