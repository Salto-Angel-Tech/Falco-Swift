import json
import re
import sys
from pathlib import Path

import pytest

from falco.studio.jobs import FLAGS, JobConflict, JobManager, build_args

SRC = Path(__file__).resolve().parents[2] / "src" / "falco"
SOURCES = {"tag": SRC / "labelling" / "tag.py", "train": SRC / "training" / "train.py"}
FAKE = Path(__file__).resolve().parent.parent / "fixtures" / "fake_job.py"


@pytest.fixture
def manager(tmp_path):
    root = tmp_path / "root"
    root.mkdir()
    jobs = JobManager(root, tmp_path / "state", scripts={"tag": FAKE, "train": FAKE})
    yield jobs
    jobs.shutdown()


# ---------- argv building ----------


def test_build_args_maps_param_keys_to_flags(tmp_path):
    args = build_args(
        "train",
        {"data": "data.jsonl", "max_len": 256, "lr": 3e-5, "epochs": "2", "base": None},
        tmp_path,
    )

    assert args == ["--data=data.jsonl", "--max-len=256", "--lr=3e-05", "--epochs=2"]


def test_build_args_for_tag_validates_choices(tmp_path):
    args = build_args(
        "tag",
        {"questions": "questions.json", "provider": "openai", "effort": "low", "base_url": ""},
        tmp_path,
    )

    assert args == ["--questions=questions.json", "--provider=openai", "--effort=low"]
    with pytest.raises(ValueError, match="provider"):
        build_args("tag", {"questions": "q.json", "provider": "acme"}, tmp_path)


def test_build_args_requires_the_tag_questions_file(tmp_path):
    with pytest.raises(ValueError, match="questions"):
        build_args("tag", {"generate": 10}, tmp_path)


@pytest.mark.parametrize(
    "params",
    [
        {"data": "data.jsonl", "shell": "rm -rf /"},
        {"epochs": "two"},
        {"epochs": True},
        {"lr": "fast"},
        {"base": "line\nbreak"},
        {"base": "nul\x00byte"},
    ],
)
def test_build_args_rejects_unknown_keys_and_bad_values(tmp_path, params):
    with pytest.raises(ValueError):
        build_args("train", params, tmp_path)


@pytest.mark.parametrize("path", ["../outside.jsonl", "..\\outside.jsonl", "/etc/passwd"])
def test_build_args_rejects_paths_outside_the_root(tmp_path, path):
    with pytest.raises(ValueError, match="outside"):
        build_args("train", {"data": path}, tmp_path)


def test_build_args_rejects_unknown_kinds(tmp_path):
    with pytest.raises(ValueError, match="kind"):
        build_args("serve", {}, tmp_path)


@pytest.mark.parametrize("kind", ["tag", "train"])
def test_whitelist_mirrors_the_real_argparse_flags(kind):
    source = SOURCES[kind].read_text(encoding="utf-8")
    declared = set(re.findall(r'add_argument\(\s*"(--[a-z-]+)"', source))

    assert {spec.flag for spec in FLAGS[kind].values()} == declared


# ---------- lifecycle ----------


def test_job_runs_to_success_and_parses_events(manager):
    job = manager.start("train", {"data": "data.jsonl", "epochs": 1})
    assert job["status"] in {"queued", "running"}
    assert job["argv"][0] == sys.executable
    assert job["argv"][1:3] == ["-u", str(FAKE)]

    manager.wait_finished(job["id"], timeout=30)
    done = manager.get(job["id"], include_lines=True)

    assert done["status"] == "succeeded"
    assert done["returncode"] == 0
    assert done["started_at"] and done["ended_at"]
    assert done["lines"][0] == "argv --data=data.jsonl --epochs=1"
    types = [event["type"] for event in done["events"]]
    assert types == ["device", "step", "epoch", "saved", "calibration", "final"]
    calibration = done["events"][4]
    assert calibration["temperature"] == 1.25
    assert calibration["after"]["ece"] == 0.02
    assert all("line" in event for event in done["events"])


def test_job_with_nonzero_exit_fails(manager):
    job = manager.start("train", {"base": "fail"})
    manager.wait_finished(job["id"], timeout=30)

    done = manager.get(job["id"])
    assert done["status"] == "failed"
    assert done["returncode"] == 3
    assert done["events"] == []


def test_only_one_job_per_kind_runs_at_a_time(manager):
    first = manager.start("train", {"base": "sleep"})
    try:
        with pytest.raises(JobConflict):
            manager.start("train", {})
    finally:
        manager.cancel(first["id"])
        manager.wait_finished(first["id"], timeout=30)


def test_cancel_stops_a_sleeping_job(manager):
    job = manager.start("train", {"base": "sleep"})
    assert manager.wait(job["id"], 0, timeout=30)  # it printed its first line

    manager.cancel(job["id"])
    manager.wait_finished(job["id"], timeout=30)

    assert manager.get(job["id"])["status"] == "cancelled"


def test_read_returns_lines_and_events_from_an_offset(manager):
    job = manager.start("train", {})
    manager.wait_finished(job["id"], timeout=30)

    chunk = manager.read(job["id"], 3)

    assert chunk["finished"] is True
    assert chunk["status"] == "succeeded"
    assert chunk["lines"][0].startswith("Epoch 1:")
    assert [event["type"] for event in chunk["events"]] == [
        "epoch",
        "saved",
        "calibration",
        "final",
    ]


def test_unknown_job_ids_raise_key_error(manager):
    with pytest.raises(KeyError):
        manager.get("nope")
    with pytest.raises(KeyError):
        manager.cancel("nope")


def test_list_returns_newest_first_without_lines(manager):
    first = manager.start("train", {})
    manager.wait_finished(first["id"], timeout=30)
    second = manager.start("tag", {"questions": "questions.json"})
    manager.wait_finished(second["id"], timeout=30)

    listed = manager.list()

    assert [job["id"] for job in listed] == [second["id"], first["id"]]
    assert "lines" not in listed[0]
    assert listed[0]["line_count"] > 0


# ---------- persistence ----------


def test_jobs_persist_and_reload_from_disk(tmp_path, manager):
    job = manager.start("train", {"data": "data.jsonl"})
    manager.wait_finished(job["id"], timeout=30)
    state = tmp_path / "state" / "jobs"

    assert (state / f"{job['id']}.log").read_text(encoding="utf-8").startswith("argv ")
    meta = json.loads((state / f"{job['id']}.json").read_text(encoding="utf-8"))
    assert meta["status"] == "succeeded"

    reloaded = JobManager(tmp_path / "root", tmp_path / "state")
    again = reloaded.get(job["id"], include_lines=True)
    assert again["status"] == "succeeded"
    assert again["lines"] == manager.get(job["id"], include_lines=True)["lines"]
    assert len(again["events"]) == 6


def test_jobs_left_running_on_disk_reload_as_interrupted(tmp_path):
    jobs_dir = tmp_path / "state" / "jobs"
    jobs_dir.mkdir(parents=True)
    meta = {
        "id": "train-old",
        "kind": "train",
        "params": {},
        "argv": [],
        "status": "running",
        "returncode": None,
        "started_at": "2026-01-01T00:00:00+00:00",
        "ended_at": None,
        "events": [],
    }
    (jobs_dir / "train-old.json").write_text(json.dumps(meta), encoding="utf-8")

    reloaded = JobManager(tmp_path, tmp_path / "state")

    job = reloaded.get("train-old")
    assert job["status"] == "failed"
    assert job["interrupted"] is True
    on_disk = json.loads((jobs_dir / "train-old.json").read_text(encoding="utf-8"))
    assert on_disk["status"] == "failed"


def test_init_does_not_create_the_state_dir(tmp_path):
    JobManager(tmp_path, tmp_path / "state")

    assert not (tmp_path / "state").exists()
