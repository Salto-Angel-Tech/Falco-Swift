from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

pytest.importorskip("torch")  # the API imports the model module

import falco.inference.api as api  # noqa: E402
from falco.questions.schema import validate_question  # noqa: E402

NOUL = {"type": "noul", "instructions": "the customer is angry"}


class FakeClassifier:
    """Stands in for the real model: no weights, no GPU, deterministic answers."""

    def __init__(self, folder):
        self.folder = folder
        self.device = "cpu"
        self.max_len = 384
        self.model = SimpleNamespace(temperature=1.5)
        self.calls = 0

    def prediction(self, state, questions):
        self.calls += 1
        for name, question in questions.items():
            validate_question(name, question)
        return {name: {"type": "noul", "noul": 0.75} for name in questions}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(api, "Classifier", FakeClassifier)
    with TestClient(api.app) as test_client:
        yield test_client


def decide(client, state="my server is down", questions=None):
    questions = {"angry": NOUL} if questions is None else questions
    return client.post("/v1/decide", json={"state": state, "questions": questions})


def test_health_reports_the_loaded_model(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "model": api.MODEL_FOLDER,
        "device": "cpu",
        "max_len": 384,
        "temperature": 1.5,
    }


def test_decide_returns_one_answer_per_question(client):
    response = decide(client)

    assert response.status_code == 200
    assert response.json() == {"angry": {"type": "noul", "noul": 0.75}}


def test_decide_rejects_an_invalid_question(client):
    response = decide(client, questions={"bad": {"type": "yesno", "instructions": "x"}})

    assert response.status_code == 400
    assert "yesno" in response.json()["detail"]


def test_decide_rejects_too_many_questions(client, monkeypatch):
    monkeypatch.setattr(api, "MAX_QUESTIONS", 2)

    response = decide(client, questions={f"q{i}": NOUL for i in range(3)})

    assert response.status_code == 400
    assert "too many questions" in response.json()["detail"]
    assert client.app.state.classifier.calls == 0


def test_decide_accepts_exactly_the_question_limit(client, monkeypatch):
    monkeypatch.setattr(api, "MAX_QUESTIONS", 2)

    assert decide(client, questions={f"q{i}": NOUL for i in range(2)}).status_code == 200


@pytest.mark.parametrize("field", ["options", "levels"])
def test_decide_rejects_too_many_options(client, monkeypatch, field):
    monkeypatch.setattr(api, "MAX_OPTIONS", 3)
    question_type = "choice" if field == "options" else "score"
    question = {"type": question_type, "instructions": "x", field: ["a", "b", "c", "d"]}

    response = decide(client, questions={"wide": question})

    assert response.status_code == 400
    assert "wide" in response.json()["detail"]
    assert "too many options" in response.json()["detail"]
    assert client.app.state.classifier.calls == 0


def test_decide_rejects_a_state_that_is_too_long(client, monkeypatch):
    monkeypatch.setattr(api, "MAX_STATE_CHARS", 10)

    response = decide(client, state="x" * 11)

    assert response.status_code == 400
    assert "state is too long" in response.json()["detail"]
    assert client.app.state.classifier.calls == 0


def test_decide_measures_json_states_after_serialization(client, monkeypatch):
    monkeypatch.setattr(api, "MAX_STATE_CHARS", 10)

    response = decide(client, state={"message": "short"})

    assert response.status_code == 400
    assert "state is too long" in response.json()["detail"]


def test_limits_default_values(monkeypatch):
    for name in ("FALCO_MAX_QUESTIONS", "FALCO_MAX_OPTIONS", "FALCO_MAX_STATE_CHARS"):
        monkeypatch.delenv(name, raising=False)

    assert api.env_limit("FALCO_MAX_QUESTIONS", 20) == 20


def test_limits_read_from_the_environment(monkeypatch):
    monkeypatch.setenv("FALCO_MAX_QUESTIONS", "5")

    assert api.env_limit("FALCO_MAX_QUESTIONS", 20) == 5


@pytest.mark.parametrize("value", ["0", "-3", "many"])
def test_limits_reject_invalid_environment_values(monkeypatch, value):
    monkeypatch.setenv("FALCO_MAX_QUESTIONS", value)

    with pytest.raises(ValueError, match="FALCO_MAX_QUESTIONS"):
        api.env_limit("FALCO_MAX_QUESTIONS", 20)
