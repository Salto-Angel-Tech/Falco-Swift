import pytest

torch = pytest.importorskip("torch")

from model import entropy_normalize, log_probs_by_group  # noqa: E402


@pytest.mark.parametrize(
    ("probs", "expected"),
    [
        ([0.5, 0.5], 1.0),
        ([0.25, 0.25, 0.25, 0.25], 1.0),
        ([1.0, 0.0], 0.0),
        ([1.0, 0.0, 0.0], 0.0),
        ([1.0], 0.0),
        ([], 0.0),
    ],
)
def test_entropy_normalize_bounds(probs, expected):
    assert entropy_normalize(probs) == pytest.approx(expected)


def test_entropy_normalize_is_between_zero_and_one():
    assert 0.0 < entropy_normalize([0.9, 0.1]) < 1.0


def test_log_probs_by_group_normalizes_each_group_independently():
    logits = torch.tensor([0.0, 0.0, 1.0, 1.0, 1.0])

    groups = log_probs_by_group(logits, [2, 3])

    assert [g.exp().tolist() for g in groups] == [
        pytest.approx([0.5, 0.5]),
        pytest.approx([1 / 3, 1 / 3, 1 / 3]),
    ]


def test_log_probs_by_group_temperature_softens_the_distribution():
    logits = torch.tensor([2.0, 0.0])

    sharp = log_probs_by_group(logits, [2])[0].exp()
    soft = log_probs_by_group(logits, [2], temperature=2.0)[0].exp()

    assert soft[0] < sharp[0]
    assert soft.tolist() == pytest.approx(torch.softmax(logits / 2.0, dim=-1).tolist())
