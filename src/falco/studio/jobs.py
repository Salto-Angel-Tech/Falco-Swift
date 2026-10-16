"""Run the tag and train stages as background jobs for Falco Studio.

Each job is a child process ([python, -u, -m, module, --flag=value...], never a shell)
whose merged stdout/stderr is read line by line, parsed into progress events and
persisted under <state_dir>/jobs/<id>.log and <id>.json so the history survives a
restart. Only whitelisted flags that mirror the modules' argparse definitions are
accepted, and file paths must stay inside the studio root.
"""

import json
import os
import secrets
import subprocess
import sys
import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from falco.labelling.teachers import PROVIDERS
from falco.studio.parse import parser_for

KINDS = ("tag", "train")
MODULES = {"tag": "falco.labelling.tag", "train": "falco.training.train"}
# Mirrors the --effort choices declared in tag.py (they are not exported as a constant).
EFFORTS = ("none", "minimal", "low", "medium", "high", "xhigh", "max")
STATUSES = ("queued", "running", "succeeded", "failed", "cancelled")
ACTIVE = ("queued", "running")


class JobConflict(RuntimeError):
    """A job of the same kind is already running."""


@dataclass(frozen=True)
class FlagSpec:
    flag: str
    kind: str  # "str", "int", "float", "path" or "choice"
    default: object = None
    choices: tuple[str, ...] = ()
    required: bool = False


FLAGS: dict[str, dict[str, FlagSpec]] = {
    "tag": {
        "questions": FlagSpec("--questions", "path", "questions.json", required=True),
        "states": FlagSpec("--states", "path"),
        "generate": FlagSpec("--generate", "int", 0),
        "domain": FlagSpec("--domain", "str", "customer messages sent to a support team"),
        "output": FlagSpec("--output", "path", "data.jsonl"),
        "provider": FlagSpec(
            "--provider", "choice", os.environ.get("FALCO_PROVIDER", "anthropic"), PROVIDERS
        ),
        "model": FlagSpec("--model", "str", os.environ.get("FALCO_MODEL")),
        "base_url": FlagSpec("--base-url", "str", os.environ.get("FALCO_BASE_URL")),
        "api_key_env": FlagSpec("--api-key-env", "str", os.environ.get("FALCO_API_KEY_ENV")),
        "effort": FlagSpec("--effort", "choice", None, EFFORTS),
        "threads": FlagSpec("--threads", "int", 4),
        "max_retries": FlagSpec("--max-retries", "int", 3),
    },
    "train": {
        "data": FlagSpec("--data", "path", "data.jsonl"),
        "base": FlagSpec("--base", "str", "microsoft/mdeberta-v3-base"),
        "output": FlagSpec("--output", "path", "model_s1"),
        "epochs": FlagSpec("--epochs", "int", 4),
        "lr": FlagSpec("--lr", "float", 2e-5),
        "batch": FlagSpec("--batch", "int", 8),
        "max_len": FlagSpec("--max-len", "int", 384),
        "val": FlagSpec("--val", "float", 0.1),
        "seed": FlagSpec("--seed", "int", 42),
    },
}


def defaults() -> dict[str, dict[str, object]]:
    """Default value of every whitelisted flag, per job kind."""
    return {
        kind: {key: spec.default for key, spec in specs.items()} for kind, specs in FLAGS.items()
    }


def resolve_in_root(root: Path, raw: str) -> Path:
    """Resolve a user supplied path against root and refuse anything that escapes it."""
    if not isinstance(raw, str) or not raw.strip() or "\x00" in raw:
        raise ValueError(f"invalid path: {raw!r}")
    base = Path(root).resolve()
    path = (base / raw).resolve()
    if not path.is_relative_to(base):
        raise ValueError(f"path is outside the studio root: {raw!r}")
    return path


def _format(key: str, spec: FlagSpec, value, root: Path) -> str:
    if isinstance(value, bool) or isinstance(value, dict | list):
        raise ValueError(f"{key}: unsupported value {value!r}")
    text = str(value)
    if "\n" in text or "\r" in text or "\x00" in text:
        raise ValueError(f"{key}: value must be a single line")
    if spec.kind == "int":
        try:
            return str(int(text))
        except ValueError:
            raise ValueError(f"{key}: expected an integer, got {value!r}") from None
    if spec.kind == "float":
        try:
            return str(float(text))
        except ValueError:
            raise ValueError(f"{key}: expected a number, got {value!r}") from None
    if spec.kind == "choice":
        if text not in spec.choices:
            raise ValueError(f"{key}: {text!r} is not one of {list(spec.choices)}")
        return text
    if spec.kind == "path":
        path = resolve_in_root(root, text)
        return path.relative_to(Path(root).resolve()).as_posix()
    return text


def build_args(kind: str, params: dict, root: Path) -> list[str]:
    """Translate {param: value} into --flag=value tokens, refusing anything off the whitelist."""
    if kind not in FLAGS:
        raise ValueError(f"unknown job kind: {kind!r}")
    if not isinstance(params, dict):
        raise ValueError("params must be an object")
    specs = FLAGS[kind]
    unknown = sorted(set(params) - set(specs))
    if unknown:
        raise ValueError(f"unknown parameters for {kind}: {unknown}")
    args = []
    for key, value in params.items():
        if value is None or value == "":
            continue
        args.append(f"{specs[key].flag}={_format(key, specs[key], value, root)}")
    for key, spec in specs.items():
        if spec.required and params.get(key) in (None, ""):
            raise ValueError(f"{key} is required for {kind}")
    return args


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


@dataclass
class Job:
    id: str
    kind: str
    params: dict
    argv: list[str]
    status: str = "queued"
    returncode: int | None = None
    started_at: str | None = None
    ended_at: str | None = None
    error: str | None = None
    interrupted: bool = False
    events: list[dict] = field(default_factory=list)
    lines: list[str] = field(default_factory=list)
    process: subprocess.Popen | None = None
    reader: threading.Thread | None = None
    cancel_requested: bool = False

    def to_dict(self, include_lines: bool = False, include_events: bool = True) -> dict:
        data = {
            "id": self.id,
            "kind": self.kind,
            "params": self.params,
            "argv": self.argv,
            "status": self.status,
            "returncode": self.returncode,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "error": self.error,
            "interrupted": self.interrupted,
            "line_count": len(self.lines),
        }
        if include_events:
            data["events"] = list(self.events)
        if include_lines:
            data["lines"] = list(self.lines)
        return data


class JobManager:
    """Start, track, cancel and persist tag/train jobs. All methods are thread-safe."""

    def __init__(
        self,
        root: Path,
        state_dir: Path,
        scripts: dict[str, Path] | None = None,
        python: str = sys.executable,
        kill_timeout: float = 5.0,
    ):
        self.root = Path(root).resolve()
        self.jobs_dir = Path(state_dir) / "jobs"
        # scripts overrides the module of a kind with a script file (used by the tests).
        if scripts:
            self.targets = {kind: [str(path)] for kind, path in scripts.items()}
        else:
            self.targets = {kind: ["-m", MODULES[kind]] for kind in KINDS}
        self.python = python
        self.kill_timeout = kill_timeout
        self.changed = threading.Condition()
        self._jobs: dict[str, Job] = {}
        self._load_history()

    # ---------- persistence ----------

    def _load_history(self) -> None:
        if not self.jobs_dir.is_dir():
            return
        loaded: list[Job] = []
        for meta_path in sorted(self.jobs_dir.glob("*.json")):
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                job = Job(
                    id=meta["id"],
                    kind=meta["kind"],
                    params=meta.get("params", {}),
                    argv=meta.get("argv", []),
                    status=meta.get("status", "failed"),
                    returncode=meta.get("returncode"),
                    started_at=meta.get("started_at"),
                    ended_at=meta.get("ended_at"),
                    error=meta.get("error"),
                    interrupted=meta.get("interrupted", False),
                    events=meta.get("events", []),
                )
            except (OSError, ValueError, KeyError, TypeError):
                continue
            log_path = meta_path.with_suffix(".log")
            if log_path.exists():
                text = log_path.read_text(encoding="utf-8", errors="replace")
                job.lines = text.splitlines()
            loaded.append(job)
        loaded.sort(key=lambda j: (j.started_at or "", j.id))
        for job in loaded:
            if job.status in ACTIVE:
                job.status = "failed"
                job.interrupted = True
                job.error = "the studio stopped while this job was running"
                job.ended_at = job.ended_at or _now()
                self._save(job)
            self._jobs[job.id] = job

    def _save(self, job: Job) -> None:
        self.jobs_dir.mkdir(parents=True, exist_ok=True)
        path = self.jobs_dir / f"{job.id}.json"
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(job.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, path)

    # ---------- lifecycle ----------

    def start(self, kind: str, params: dict) -> dict:
        args = build_args(kind, params, self.root)
        argv = [self.python, "-u", *self.targets[kind], *args]
        with self.changed:
            if any(j.kind == kind and j.status in ACTIVE for j in self._jobs.values()):
                raise JobConflict(f"a {kind} job is already running")
            stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
            job = Job(
                id=f"{kind}-{stamp}-{secrets.token_hex(3)}", kind=kind, params=params, argv=argv
            )
            self._jobs[job.id] = job
            self._save(job)
        env = {**os.environ, "PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8"}
        try:
            process = subprocess.Popen(
                argv,
                cwd=self.root,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )
        except OSError as error:
            with self.changed:
                job.status, job.error, job.ended_at = "failed", str(error), _now()
                self._save(job)
                self.changed.notify_all()
            return job.to_dict()
        with self.changed:
            job.process = process
            job.status = "running"
            job.started_at = _now()
            job.reader = threading.Thread(target=self._read, args=(job,), daemon=True)
            self._save(job)
            job.reader.start()
            self.changed.notify_all()
            return job.to_dict()

    def _read(self, job: Job) -> None:
        parser = parser_for(job.kind)
        self.jobs_dir.mkdir(parents=True, exist_ok=True)
        with open(self.jobs_dir / f"{job.id}.log", "a", encoding="utf-8") as log:
            for raw in job.process.stdout:
                line = raw.rstrip("\r\n")
                log.write(line + "\n")
                log.flush()
                event = parser.feed(line)
                with self.changed:
                    if event is not None:
                        job.events.append({**event, "line": len(job.lines)})
                    job.lines.append(line)
                    if event is not None:
                        self._save(job)
                    self.changed.notify_all()
        returncode = job.process.wait()
        with self.changed:
            job.returncode = returncode
            job.ended_at = _now()
            if job.cancel_requested:
                job.status = "cancelled"
            else:
                job.status = "succeeded" if returncode == 0 else "failed"
            self._save(job)
            self.changed.notify_all()

    def cancel(self, job_id: str) -> dict:
        with self.changed:
            job = self._jobs[job_id]
            process = job.process
            if job.status not in ACTIVE or process is None:
                return job.to_dict()
            job.cancel_requested = True
        process.terminate()
        threading.Thread(target=self._kill_later, args=(process,), daemon=True).start()
        return self.get(job_id)

    def _kill_later(self, process: subprocess.Popen) -> None:
        try:
            process.wait(timeout=self.kill_timeout)
        except subprocess.TimeoutExpired:
            process.kill()

    def shutdown(self) -> None:
        """Terminate every running job (used on app shutdown and in tests)."""
        with self.changed:
            running = [j.id for j in self._jobs.values() if j.status == "running"]
        for job_id in running:
            self.cancel(job_id)
            self.wait_finished(job_id, timeout=self.kill_timeout + 5)

    # ---------- queries ----------

    def list(self) -> list[dict]:
        with self.changed:
            return [job.to_dict(include_events=False) for job in reversed(self._jobs.values())]

    def get(self, job_id: str, include_lines: bool = False) -> dict:
        with self.changed:
            return self._jobs[job_id].to_dict(include_lines=include_lines)

    def read(self, job_id: str, offset: int = 0) -> dict:
        """Lines from offset on, the events those lines produced, and whether the job ended."""
        with self.changed:
            job = self._jobs[job_id]
            offset = max(0, offset)
            lines = job.lines[offset:]
            end = offset + len(lines)
            return {
                "offset": offset,
                "lines": lines,
                "events": [e for e in job.events if offset <= e.get("line", -1) < end],
                "status": job.status,
                "returncode": job.returncode,
                "finished": job.status not in ACTIVE,
            }

    def wait(self, job_id: str, offset: int, timeout: float) -> bool:
        """Block until the job has more than offset lines or ended; False on timeout."""
        with self.changed:
            job = self._jobs[job_id]
            return self.changed.wait_for(
                lambda: len(job.lines) > offset or job.status not in ACTIVE, timeout
            )

    def wait_finished(self, job_id: str, timeout: float) -> bool:
        with self.changed:
            job = self._jobs[job_id]
            return self.changed.wait_for(lambda: job.status not in ACTIVE, timeout)
