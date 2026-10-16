import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import falco.studio.app as studio
from falco.questions.schema import validate_question

FAKE = Path(__file__).resolve().parent.parent / "fixtures" / "fake_job.py"
NOUL = {"type": "noul", "instructions": "the customer is angry"}
CHOICE = {"type": "choice", "instructions": "area", "options": ["billing", "tech"]}


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
def root(tmp_path):
    root = tmp_path / "root"
    root.mkdir()
    (root / "questions.json").write_text(json.dumps({"angry": NOUL}), encoding="utf-8")
    return root


@pytest.fixture
def client(root, tmp_path, monkeypatch):
    monkeypatch.setattr(studio, "load_classifier", FakeClassifier)
    app = studio.create_app(
        root=root, state_dir=tmp_path / "state", scripts={"tag": FAKE, "train": FAKE}
    )
    with TestClient(app) as test_client:
        yield test_client


def make_model(root: Path, name: str, temperature: float = 1.2) -> Path:
    folder = root / name
    folder.mkdir()
    (folder / "config.json").write_text(
        json.dumps({"max_len": 384, "temperature": temperature}), encoding="utf-8"
    )
    (folder / "head.pt").write_bytes(b"")
    return folder


# ---------- config ----------


def test_create_app_reads_root_and_state_from_the_environment(tmp_path, monkeypatch):
    monkeypatch.setenv("FALCO_STUDIO_ROOT", str(tmp_path))
    monkeypatch.setenv("FALCO_STUDIO_STATE", "custom_state")

    app = studio.create_app()

    assert app.state.root == tmp_path.resolve()
    assert app.state.jobs.jobs_dir == tmp_path.resolve() / "custom_state" / "jobs"


def test_cors_allows_only_the_vite_dev_server(client):
    allowed = client.options(
        "/api/meta",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    denied = client.options(
        "/api/meta",
        headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"},
    )

    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-origin" not in denied.headers


# ---------- meta ----------


def test_meta_lists_providers_efforts_types_and_defaults(client):
    meta = client.get("/api/meta").json()

    assert "anthropic" in meta["providers"]
    assert meta["default_models"]["anthropic"]
    assert "low" in meta["efforts"]
    assert meta["question_types"] == ["noul", "choice", "score"]
    assert meta["defaults"]["train"]["max_len"] == 384
    assert meta["defaults"]["tag"]["questions"] == "questions.json"


# ---------- questions ----------


def test_get_questions_reads_the_file(client):
    response = client.get("/api/questions", params={"path": "questions.json"})

    assert response.status_code == 200
    assert response.json() == {"path": "questions.json", "questions": {"angry": NOUL}}


def test_get_questions_missing_file_is_404(client):
    assert client.get("/api/questions", params={"path": "nope.json"}).status_code == 404


def test_put_questions_writes_pretty_utf8_json(client, root):
    questions = {"área": CHOICE, "angry": NOUL}

    response = client.put(
        "/api/questions", params={"path": "q2.json"}, json={"questions": questions}
    )

    assert response.status_code == 200
    text = (root / "q2.json").read_text(encoding="utf-8")
    assert "área" in text
    assert "\n  " in text
    assert json.loads(text) == questions


def test_put_questions_reports_every_invalid_question(client, root):
    questions = {"ok": NOUL, "bad": {"type": "yesno", "instructions": "x"}, "empty": {}}

    response = client.put(
        "/api/questions", params={"path": "questions.json"}, json={"questions": questions}
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert set(detail) == {"bad", "empty"}
    assert "yesno" in detail["bad"]
    assert json.loads((root / "questions.json").read_text(encoding="utf-8")) == {"angry": NOUL}


@pytest.mark.parametrize("path", ["../escape.json", "questions.txt", "..\\escape.json"])
def test_questions_paths_must_be_json_inside_the_root(client, path):
    assert client.get("/api/questions", params={"path": path}).status_code == 400
    response = client.put("/api/questions", params={"path": path}, json={"questions": {}})
    assert response.status_code == 400


# ---------- data ----------


def row(state, question="angry", target=(0.7, 0.3)):
    return {
        "state": state,
        "question": question,
        "type": "noul",
        "instructions": "x",
        "options": ["sí", "no"],
        "target": list(target),
    }


def test_data_summary_counts_rows_states_and_questions(client, root):
    lines = [
        json.dumps(row("a")),
        json.dumps(row("a", "urgent")),
        json.dumps(row("b")),
        json.dumps(row("c", target=(0.9, 0.9))),  # does not sum to 1
        "{half written",
        "",
    ]
    (root / "data.jsonl").write_text("\n".join(lines), encoding="utf-8")

    summary = client.get("/api/data", params={"path": "data.jsonl"}).json()

    assert summary["exists"] is True
    assert summary["rows"] == 5
    assert summary["usable"] == 3
    assert summary["states"] == 2
    assert summary["questions"] == {"angry": 2, "urgent": 1}
    assert len(summary["sample"]) == 4
    assert summary["sample"][0]["state"] == "a"


def test_data_summary_of_a_missing_file_is_all_zeros(client):
    summary = client.get("/api/data", params={"path": "data.jsonl"}).json()

    assert summary == {
        "path": "data.jsonl",
        "exists": False,
        "rows": 0,
        "usable": 0,
        "states": 0,
        "questions": {},
        "sample": [],
    }


def test_data_path_is_confined_to_the_root(client):
    assert client.get("/api/data", params={"path": "../data.jsonl"}).status_code == 400


def test_usable_row_mirrors_train():
    pytest.importorskip("torch")
    from falco.training import train

    samples = [row("a"), row("a", target=(0.9, 0.9)), {"state": "a"}, "text", row("")]
    assert [studio.usable_row(s) for s in samples] == [train.usable_row(s) for s in samples]


# ---------- models and decide ----------


def test_models_lists_trained_folders(client, root):
    make_model(root, "model_a")
    make_model(root, "custom")
    (root / "model_partial").mkdir()
    (root / "notes").mkdir()

    models = {m["folder"]: m for m in client.get("/api/models").json()}

    assert set(models) == {"model_a", "custom", "model_partial"}
    assert models["model_a"]["config"] == {"max_len": 384, "temperature": 1.2}
    assert models["model_a"]["complete"] is True
    assert models["model_partial"]["complete"] is False
    assert models["model_a"]["active"] is False
    assert models["model_a"]["mtime"] > 0


def test_decide_without_a_loaded_model_is_409(client):
    response = client.post("/api/decide", json={"state": "hi", "questions": {"angry": NOUL}})

    assert response.status_code == 409
    assert client.get("/api/models/active").json() == {"active": None}


def test_load_model_then_decide(client, root):
    make_model(root, "model_a")

    loaded = client.post("/api/models/load", json={"folder": "model_a"})
    response = client.post("/api/decide", json={"state": "hi", "questions": {"angry": NOUL}})

    assert loaded.status_code == 200
    assert loaded.json() == {
        "folder": "model_a",
        "device": "cpu",
        "max_len": 384,
        "temperature": 1.5,
    }
    assert client.get("/api/models/active").json()["active"]["folder"] == "model_a"
    assert response.status_code == 200
    assert response.json() == {"angry": {"type": "noul", "noul": 0.75}}
    listed = {m["folder"]: m for m in client.get("/api/models").json()}
    assert listed["model_a"]["active"] is True


def test_loading_a_second_model_replaces_the_first(client, root):
    make_model(root, "model_a")
    make_model(root, "model_b")

    client.post("/api/models/load", json={"folder": "model_a"})
    client.post("/api/models/load", json={"folder": "model_b"})

    assert client.app.state.classifier.folder.endswith("model_b")


@pytest.mark.parametrize("folder", ["../outside", "missing_model"])
def test_load_model_rejects_bad_folders(client, folder):
    assert client.post("/api/models/load", json={"folder": folder}).status_code == 400


def test_load_model_reports_loader_errors_as_400(client, root, monkeypatch):
    make_model(root, "model_a")

    def broken(folder):
        raise OSError("no weights")

    monkeypatch.setattr(studio, "load_classifier", broken)

    response = client.post("/api/models/load", json={"folder": "model_a"})
    assert response.status_code == 400
    assert "no weights" in response.json()["detail"]


@pytest.fixture
def loaded(client, root):
    make_model(root, "model_a")
    client.post("/api/models/load", json={"folder": "model_a"})
    return client


def test_decide_rejects_invalid_questions(loaded):
    response = loaded.post(
        "/api/decide", json={"state": "hi", "questions": {"bad": {"type": "yesno"}}}
    )

    assert response.status_code == 400
    assert "yesno" in response.json()["detail"]


def test_decide_applies_the_api_limits(loaded, monkeypatch):
    monkeypatch.setattr(studio, "MAX_QUESTIONS", 1)
    monkeypatch.setattr(studio, "MAX_STATE_CHARS", 5)
    monkeypatch.setattr(studio, "MAX_OPTIONS", 1)

    too_many = loaded.post("/api/decide", json={"state": "hi", "questions": {"a": NOUL, "b": NOUL}})
    too_long = loaded.post("/api/decide", json={"state": "x" * 6, "questions": {"a": NOUL}})
    too_wide = loaded.post("/api/decide", json={"state": "hi", "questions": {"a": CHOICE}})

    assert "too many questions" in too_many.json()["detail"]
    assert "state is too long" in too_long.json()["detail"]
    assert "too many options" in too_wide.json()["detail"]
    assert {too_many.status_code, too_long.status_code, too_wide.status_code} == {400}
    assert loaded.app.state.classifier.calls == 0


# ---------- cases and evaluate ----------


def test_cases_crud(client, root):
    assert client.get("/api/cases").json() == []

    created = client.put("/api/cases/refund_1", json={"id": "R1", "state": "give me my money"})
    listed = client.get("/api/cases").json()
    deleted = client.delete("/api/cases/refund_1")

    assert created.status_code == 200
    assert listed == [{"name": "refund_1", "id": "R1", "state": "give me my money"}]
    assert deleted.status_code == 200
    assert not (root / "cases" / "refund_1.json").exists()
    assert client.delete("/api/cases/refund_1").status_code == 404


def test_cases_accept_json_states_and_a_custom_dir(client, root):
    response = client.put(
        "/api/cases/c1", params={"dir": "my_cases"}, json={"state": {"msg": "hi"}}
    )

    assert response.status_code == 200
    saved = json.loads((root / "my_cases" / "c1.json").read_text(encoding="utf-8"))
    assert saved == {"state": {"msg": "hi"}}


@pytest.mark.parametrize("name", ["bad.name", "spaces here", "..", "a%2F..%2Fb"])
def test_case_names_must_be_safe(client, name):
    assert client.put(f"/api/cases/{name}", json={"state": "x"}).status_code in {400, 404, 405}


def test_case_dir_is_confined_to_the_root(client):
    assert client.get("/api/cases", params={"dir": "../x"}).status_code == 400


def test_case_without_state_is_rejected(client):
    assert client.put("/api/cases/c1", json={"id": "x"}).status_code == 422


def test_evaluate_runs_every_case_through_the_active_model(loaded, root):
    loaded.put("/api/cases/b", json={"state": "second"})
    loaded.put("/api/cases/a", json={"id": "A", "state": "first"})
    (root / "cases" / "broken.json").write_text("{nope", encoding="utf-8")
    (root / "cases" / "stateless.json").write_text('{"id": "S"}', encoding="utf-8")

    response = loaded.post(
        "/api/evaluate", json={"dir": "cases", "questions_path": "questions.json"}
    )

    assert response.status_code == 200
    results = response.json()
    assert [r["file"] for r in results] == ["a.json", "b.json", "broken.json", "stateless.json"]
    assert results[0] == {
        "file": "a.json",
        "id": "A",
        "state": "first",
        "result": {"angry": {"type": "noul", "noul": 0.75}},
        "error": None,
    }
    assert results[2]["result"] is None and results[2]["error"]
    assert results[3]["error"] == "no 'state' field"


def test_evaluate_without_a_model_is_409(client):
    response = client.post(
        "/api/evaluate", json={"dir": "cases", "questions_path": "questions.json"}
    )
    assert response.status_code == 409


# ---------- jobs ----------


def wait_done(client, job_id):
    assert client.app.state.jobs.wait_finished(job_id, timeout=30)


def test_start_list_get_a_job(client):
    response = client.post("/api/jobs", json={"kind": "train", "params": {"epochs": 1}})
    assert response.status_code == 200
    job_id = response.json()["id"]
    wait_done(client, job_id)

    listed = client.get("/api/jobs").json()
    job = client.get(f"/api/jobs/{job_id}", params={"lines": True}).json()

    assert listed[0]["id"] == job_id
    assert job["status"] == "succeeded"
    assert job["lines"][0] == "argv --epochs=1"
    assert [e["type"] for e in job["events"]][0] == "device"


def test_jobs_reject_bad_params_and_kinds(client):
    assert client.post("/api/jobs", json={"kind": "train", "params": {"x": 1}}).status_code == 400
    assert (
        client.post("/api/jobs", json={"kind": "train", "params": {"data": "../d"}}).status_code
        == 400
    )
    assert client.post("/api/jobs", json={"kind": "serve", "params": {}}).status_code == 400


def test_jobs_conflict_and_cancel(client):
    first = client.post("/api/jobs", json={"kind": "train", "params": {"base": "sleep"}}).json()

    conflict = client.post("/api/jobs", json={"kind": "train", "params": {}})
    cancelled = client.post(f"/api/jobs/{first['id']}/cancel")
    wait_done(client, first["id"])

    assert conflict.status_code == 409
    assert cancelled.status_code == 200
    assert client.get(f"/api/jobs/{first['id']}").json()["status"] == "cancelled"


def test_unknown_jobs_are_404(client):
    assert client.get("/api/jobs/nope").status_code == 404
    assert client.post("/api/jobs/nope/cancel").status_code == 404
    assert client.get("/api/jobs/nope/events").status_code == 404


def parse_sse(text: str) -> list[tuple[str, dict]]:
    events = []
    for block in text.strip().split("\n\n"):
        fields = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        events.append((fields["event"], json.loads(fields["data"])))
    return events


def test_events_stream_replays_a_finished_job(client):
    job_id = client.post("/api/jobs", json={"kind": "train", "params": {}}).json()["id"]
    wait_done(client, job_id)

    response = client.get(f"/api/jobs/{job_id}/events")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(response.text)
    assert events[0] == ("line", {"offset": 0, "text": "argv "})
    kinds = [kind for kind, _ in events]
    assert kinds.count("event") == 6
    assert events[-1] == ("status", {"status": "succeeded", "returncode": 0})
    device = next(data for kind, data in events if kind == "event")
    assert device == {"type": "device", "device": "cpu", "train": 9, "validation": 1, "line": 1}


def test_events_stream_honours_the_offset(client):
    job_id = client.post("/api/jobs", json={"kind": "train", "params": {}}).json()["id"]
    wait_done(client, job_id)

    events = parse_sse(client.get(f"/api/jobs/{job_id}/events", params={"offset": 8}).text)

    assert events == [
        ("line", {"offset": 8, "text": "  generated 2/2"}),
        ("line", {"offset": 9, "text": "Done: 2 states labelled, 0 failed -> data.jsonl"}),
        ("line", {"offset": 10, "text": "Final model in model_test"}),
        ("event", {"type": "final", "path": "model_test", "line": 10}),
        ("status", {"status": "succeeded", "returncode": 0}),
    ]
