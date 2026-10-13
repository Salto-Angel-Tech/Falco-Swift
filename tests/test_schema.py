import pytest

from schema import normalize_state, options_of, text_question, validate_question


@pytest.mark.parametrize(
    "question",
    [
        {"type": "noul", "instructions": "the customer is angry"},
        {"type": "choice", "instructions": "area", "options": ["billing", "other"]},
        {"type": "score", "instructions": "frustration", "levels": ["low", "high"]},
    ],
)
def test_validate_question_accepts_valid_questions(question):
    validate_question("q", question)


@pytest.mark.parametrize(
    "question",
    [
        {"type": "yesno", "instructions": "unknown type"},
        {"instructions": "missing type"},
        {"type": "noul"},
        {"type": "noul", "instructions": ""},
        {"type": "choice", "instructions": "area", "options": ["only one"]},
        {"type": "choice", "instructions": "area"},
        {"type": "score", "instructions": "frustration", "levels": ["only one"]},
    ],
)
def test_validate_question_rejects_invalid_questions(question):
    with pytest.raises(ValueError):
        validate_question("q", question)


def test_options_of_noul_is_the_fixed_spanish_pair():
    assert options_of({"type": "noul", "instructions": "x"}) == ["sí", "no"]


def test_options_of_noul_returns_a_copy():
    options_of({"type": "noul", "instructions": "x"}).append("maybe")

    assert options_of({"type": "noul", "instructions": "x"}) == ["sí", "no"]


def test_options_of_choice_and_score_stringify_values():
    assert options_of({"type": "choice", "options": ["a", 2]}) == ["a", "2"]
    assert options_of({"type": "score", "levels": [0, 1, 2]}) == ["0", "1", "2"]


def test_options_of_rejects_unknown_type():
    with pytest.raises(ValueError):
        options_of({"type": "yesno"})


# Regression: this text is the model input. Changing it breaks already trained models.
@pytest.mark.parametrize(
    ("question_type", "expected"),
    [
        ("noul", "Afirmation : the customer is angry: sí"),
        ("choice", "Question : the customer is angry: sí"),
        ("score", "Score : the customer is angry: sí"),
    ],
)
def test_text_question_exact_model_input(question_type, expected):
    assert text_question(question_type, "the customer is angry", "sí") == expected


def test_normalize_state_strips_strings():
    assert normalize_state("  my server is down \n") == "my server is down"


def test_normalize_state_serializes_json_with_sorted_keys_and_unicode():
    state = {"b": 1, "a": "facturación"}

    assert normalize_state(state) == '{"a": "facturación", "b": 1}'
