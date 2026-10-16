import json
import math

import pytest

torch = pytest.importorskip("torch")

from falco.training.train import fit_temperature, load_and_split, metrics, usable_row  # noqa: E402

ROW = {
    "state": "my server is down",
    "question": "urgent",
    "type": "noul",
    "instructions": "the customer needs an answer today",
    "options": ["sí", "no"],
    "target": [0.9, 0.1],
}


def test_usable_row_accepts_a_well_formed_row():
    assert usable_row(ROW)


@pytest.mark.parametrize(
    "change",
    [
        {"state": ""},
        {"question": None},
        {"options": "sí,no"},
        {"options": ["sí"], "target": [1.0]},
        {"target": [0.9]},
        {"target": [0.6, 0.6]},
    ],
)
def test_usable_row_rejects_malformed_rows(change):
    assert not usable_row({**ROW, **change})


def test_usable_row_rejects_non_dicts():
    assert not usable_row(["not", "a", "row"])


def write_rows(path, n_states, questions=("urgent", "refund")):
    lines = [
        json.dumps({**ROW, "state": f"state {i}", "question": q})
        for i in range(n_states)
        for q in questions
    ]
    path.write_text("\n".join(lines) + "\nnot json\n\n", encoding="utf-8")


def test_load_and_split_never_leaks_a_state_between_train_and_val(tmp_path):
    data = tmp_path / "data.jsonl"
    write_rows(data, n_states=10)

    train, val = load_and_split(str(data), val_frac=0.3, seed=0)

    train_states = {row["state"] for row in train}
    val_states = {row["state"] for row in val}
    assert train_states.isdisjoint(val_states)
    assert len(val_states) == 3
    assert len(train) + len(val) == 20  # the malformed line is dropped


def test_load_and_split_is_reproducible_with_the_same_seed(tmp_path):
    data = tmp_path / "data.jsonl"
    write_rows(data, n_states=10)

    assert load_and_split(str(data), 0.3, seed=7) == load_and_split(str(data), 0.3, seed=7)


def test_load_and_split_needs_two_distinct_states(tmp_path):
    data = tmp_path / "data.jsonl"
    write_rows(data, n_states=1)

    with pytest.raises(SystemExit):
        load_and_split(str(data), val_frac=0.1, seed=0)


def test_metrics_match_a_hand_computed_case():
    # Both groups predict 0.75 for their top option; the teacher agrees with the first only.
    groups = [torch.tensor([math.log(3), 0.0]), torch.tensor([0.0, math.log(3)])]
    targets = [torch.tensor([1.0, 0.0]), torch.tensor([1.0, 0.0])]

    result = metrics(groups, targets)

    expected_loss = (-math.log(0.75) - math.log(0.25)) / 2
    assert result["loss"] == pytest.approx(expected_loss, abs=1e-4)
    assert result["accuracy"] == 0.5
    assert result["ece"] == pytest.approx(0.25, abs=1e-4)  # one bin: |0.5 - 0.75|
    assert result["n"] == 2


def test_metrics_on_an_empty_set():
    assert metrics([], []) == {"loss": None, "accuracy": None, "ece": None, "n": 0}


def test_fit_temperature_keeps_calibrated_logits_unchanged():
    groups = [torch.tensor([2.0, 0.0, -1.0]), torch.tensor([0.5, 1.5])]
    targets = [torch.softmax(g, dim=-1) for g in groups]

    assert fit_temperature(groups, targets) == pytest.approx(1.0, abs=0.05)


def test_fit_temperature_softens_overconfident_logits():
    groups = [torch.tensor([10.0, 0.0]), torch.tensor([0.0, 10.0])]
    targets = [torch.tensor([0.7, 0.3]), torch.tensor([0.3, 0.7])]

    assert fit_temperature(groups, targets) > 1.0


def test_fit_temperature_without_data_is_identity():
    assert fit_temperature([], []) == 1.0
