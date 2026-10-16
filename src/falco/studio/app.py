"""Falco Studio: a local web UI backend to edit questions, run tag/train jobs and try models.

    uv run falco studio --host 127.0.0.1 --port 8001

Every file the API touches is confined to FALCO_STUDIO_ROOT (default: the current directory) and
job history lives in FALCO_STUDIO_STATE (default: .falco_studio, relative to the root).
The model module (torch) is imported lazily, only when a model is loaded. If web/dist
exists (relative to the root) it is served at "/" after the API routes.
"""

import asyncio
import json
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from falco.labelling.tag import DEFAULT_MODELS
from falco.labelling.teachers import PROVIDERS
from falco.questions.schema import QUESTION_TYPES, normalize_state, options_of, validate_question
from falco.studio.jobs import EFFORTS, JobConflict, JobManager, defaults, resolve_in_root

WEB_DIST = Path("web") / "dist"  # relative to the studio root
CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
CASE_NAME = re.compile(r"^[A-Za-z0-9_-]+$")
SAMPLE_ROWS = 20
TARGET_TOLERANCE = 1e-2  # same as train.TARGET_TOLERANCE
SSE_POLL_SECONDS = 0.25
SSE_HEARTBEAT_SECONDS = 15.0


# ---------- limits (identical to the API, which cannot be imported without torch) ----------


def env_limit(name: str, default: int) -> int:
    """Read a positive integer limit from the environment."""
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        value = 0
    if value < 1:
        raise ValueError(f"{name} must be a positive integer, got {raw!r}")
    return value


MAX_QUESTIONS = env_limit("FALCO_MAX_QUESTIONS", 20)
MAX_OPTIONS = env_limit("FALCO_MAX_OPTIONS", 20)
MAX_STATE_CHARS = env_limit("FALCO_MAX_STATE_CHARS", 20_000)


def check_limits(state: Any, questions: dict[str, dict]) -> None:
    """Reject requests big enough to exhaust memory or stall the model (as the API does)."""
    if len(questions) > MAX_QUESTIONS:
        raise ValueError(f"too many questions: {len(questions)} (max {MAX_QUESTIONS})")
    state_chars = len(normalize_state(state))
    if state_chars > MAX_STATE_CHARS:
        raise ValueError(f"state is too long: {state_chars} characters (max {MAX_STATE_CHARS})")
    for name, question in questions.items():
        validate_question(name, question)
        count = len(options_of(question))
        if count > MAX_OPTIONS:
            raise ValueError(f"{name}: too many options: {count} (max {MAX_OPTIONS})")


def usable_row(row) -> bool:
    """Same rule as train.usable_row, kept here so the studio does not import torch."""
    if not isinstance(row, dict):
        return False
    if not all(row.get(k) for k in ("state", "question", "type", "instructions")):
        return False
    options, target = row.get("options"), row.get("target")
    if not isinstance(options, list) or not isinstance(target, list):
        return False
    if len(options) < 2 or len(target) != len(options):
        return False
    try:
        return abs(sum(target) - 1.0) <= TARGET_TOLERANCE
    except TypeError:
        return False


def load_classifier(folder: str):
    """Load a trained model. Imported lazily: torch is heavy and tests replace this."""
    from falco.inference.model import Classifier

    return Classifier(folder)


# ---------- request bodies ----------


class QuestionsBody(BaseModel):
    questions: dict[str, Any]


class JobRequest(BaseModel):
    kind: str
    params: dict[str, Any] = Field(default_factory=dict)


class LoadRequest(BaseModel):
    folder: str


class DecideRequest(BaseModel):
    state: Any = Field(description="the text (or JSON) to judge")
    questions: dict[str, dict] = Field(description="question name -> question definition")


class CaseBody(BaseModel):
    id: str | None = None
    state: Any


class EvaluateRequest(BaseModel):
    dir: str = "cases"
    questions_path: str = "questions.json"


# ---------- helpers ----------


def confined(request: Request, raw: str, suffix: str | None = None) -> Path:
    """Resolve a path inside the studio root or fail with 400."""
    try:
        path = resolve_in_root(request.app.state.root, raw)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if suffix and path.suffix.lower() != suffix:
        raise HTTPException(status_code=400, detail=f"path must end with {suffix}: {raw!r}")
    return path


def relative(request: Request, path: Path) -> str:
    return path.relative_to(request.app.state.root).as_posix()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def question_errors(questions: dict) -> dict[str, str]:
    errors = {}
    for name, question in questions.items():
        if not isinstance(question, dict):
            errors[name] = "a question must be an object"
            continue
        try:
            validate_question(name, question)
        except ValueError as error:
            errors[name] = str(error)
    return errors


def active_classifier(request: Request):
    classifier = getattr(request.app.state, "classifier", None)
    if classifier is None:
        raise HTTPException(status_code=409, detail="no model loaded: POST /api/models/load")
    return classifier


def job_or_404(request: Request, job_id: str, include_lines: bool = False) -> dict:
    try:
        return request.app.state.jobs.get(job_id, include_lines=include_lines)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown job: {job_id}") from None


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# ---------- routes ----------

router = APIRouter(prefix="/api")


@router.get("/meta")
def meta():
    return {
        "providers": list(PROVIDERS),
        "default_models": DEFAULT_MODELS,
        "efforts": list(EFFORTS),
        "question_types": list(QUESTION_TYPES),
        "defaults": defaults(),
    }


@router.get("/questions")
def get_questions(request: Request, path: str = "questions.json"):
    target = confined(request, path, ".json")
    if not target.is_file():
        raise HTTPException(status_code=404, detail=f"not found: {path}")
    try:
        questions = read_json(target)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=f"invalid JSON: {error}") from error
    return {"path": relative(request, target), "questions": questions}


@router.put("/questions")
def put_questions(body: QuestionsBody, request: Request, path: str = "questions.json"):
    target = confined(request, path, ".json")
    errors = question_errors(body.questions)
    if errors:
        raise HTTPException(status_code=400, detail=errors)
    write_json(target, body.questions)
    return {"path": relative(request, target), "questions": body.questions}


@router.get("/data")
def data_summary(request: Request, path: str = "data.jsonl"):
    target = confined(request, path)
    summary = {
        "path": relative(request, target),
        "exists": target.is_file(),
        "rows": 0,
        "usable": 0,
        "states": 0,
        "questions": {},
        "sample": [],
    }
    if not target.is_file():
        return summary
    states, questions = set(), {}
    with target.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            if not line.strip():
                continue
            summary["rows"] += 1
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if len(summary["sample"]) < SAMPLE_ROWS:
                summary["sample"].append(row)
            if not usable_row(row):
                continue
            summary["usable"] += 1
            states.add(normalize_state(row["state"]))
            questions[row["question"]] = questions.get(row["question"], 0) + 1
    summary["states"] = len(states)
    summary["questions"] = questions
    return summary


# ----- jobs -----


@router.post("/jobs")
def start_job(body: JobRequest, request: Request):
    try:
        return request.app.state.jobs.start(body.kind, body.params)
    except JobConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/jobs")
def list_jobs(request: Request):
    return request.app.state.jobs.list()


@router.get("/jobs/{job_id}")
def get_job(job_id: str, request: Request, lines: bool = False):
    return job_or_404(request, job_id, include_lines=lines)


@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str, request: Request):
    try:
        return request.app.state.jobs.cancel(job_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown job: {job_id}") from None


@router.get("/jobs/{job_id}/events")
async def job_events(job_id: str, request: Request, offset: int = 0):
    job_or_404(request, job_id)
    jobs: JobManager = request.app.state.jobs

    async def stream():
        position = max(0, offset)
        idle = 0.0
        while True:
            chunk = jobs.read(job_id, position)
            for i, text in enumerate(chunk["lines"]):
                yield sse("line", {"offset": position + i, "text": text})
            for event in chunk["events"]:
                yield sse("event", event)
            position += len(chunk["lines"])
            if chunk["finished"]:
                yield sse("status", {"status": chunk["status"], "returncode": chunk["returncode"]})
                return
            if chunk["lines"]:
                idle = 0.0
            elif idle >= SSE_HEARTBEAT_SECONDS:
                idle = 0.0
                yield ": ping\n\n"
            if await request.is_disconnected():
                return
            await asyncio.sleep(SSE_POLL_SECONDS)
            idle += SSE_POLL_SECONDS

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ----- models -----


def model_info(classifier, folder: str) -> dict:
    return {
        "folder": folder,
        "device": classifier.device,
        "max_len": classifier.max_len,
        "temperature": round(float(classifier.model.temperature), 4),
    }


@router.get("/models")
def list_models(request: Request):
    root: Path = request.app.state.root
    active = request.app.state.active_model
    models = []
    for folder in sorted(p for p in root.iterdir() if p.is_dir()):
        config_path = folder / "config.json"
        complete = config_path.is_file() and (folder / "head.pt").is_file()
        if not (folder.name.startswith("model_") or complete):
            continue
        try:
            config = read_json(config_path) if config_path.is_file() else None
        except (OSError, ValueError):
            config = None
        stamp = config_path if config_path.is_file() else folder
        models.append(
            {
                "folder": folder.name,
                "config": config,
                "complete": complete,
                "mtime": stamp.stat().st_mtime,
                "active": active is not None and active["folder"] == folder.name,
            }
        )
    return models


@router.get("/models/active")
def active_model(request: Request):
    return {"active": request.app.state.active_model}


@router.post("/models/load")
def load_model(body: LoadRequest, request: Request):
    folder = confined(request, body.folder)
    if not folder.is_dir():
        raise HTTPException(status_code=400, detail=f"not a model folder: {body.folder!r}")
    try:
        classifier = load_classifier(str(folder))
    except (OSError, KeyError, ValueError, RuntimeError) as error:
        raise HTTPException(
            status_code=400, detail=f"cannot load {body.folder!r}: {type(error).__name__}: {error}"
        ) from error
    info = model_info(classifier, relative(request, folder))
    request.app.state.classifier = classifier
    request.app.state.active_model = info
    return info


@router.post("/decide")
def decide(body: DecideRequest, request: Request):
    classifier = active_classifier(request)
    try:
        check_limits(body.state, body.questions)
        return classifier.prediction(body.state, body.questions)
    except (ValueError, KeyError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


# ----- cases -----


def case_path(request: Request, directory: str, name: str) -> Path:
    if not CASE_NAME.match(name):
        raise HTTPException(status_code=400, detail="case names may only use A-Z a-z 0-9 _ -")
    return confined(request, directory) / f"{name}.json"


@router.get("/cases")
def list_cases(request: Request, dir: str = "cases"):
    folder = confined(request, dir)
    cases = []
    for path in sorted(folder.glob("*.json")) if folder.is_dir() else []:
        try:
            case = read_json(path)
            if not isinstance(case, dict):
                raise ValueError("a case must be a JSON object")
            cases.append({"name": path.stem, "id": case.get("id"), "state": case.get("state")})
        except (OSError, ValueError) as error:
            cases.append({"name": path.stem, "id": None, "state": None, "error": str(error)})
    return cases


@router.put("/cases/{name}")
def put_case(name: str, body: CaseBody, request: Request, dir: str = "cases"):
    path = case_path(request, dir, name)
    if body.state is None:
        raise HTTPException(status_code=400, detail="state is required")
    case = {"id": body.id, "state": body.state} if body.id is not None else {"state": body.state}
    write_json(path, case)
    return {"name": name, "id": body.id, "state": body.state}


@router.delete("/cases/{name}")
def delete_case(name: str, request: Request, dir: str = "cases"):
    path = case_path(request, dir, name)
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"unknown case: {name}")
    path.unlink()
    return {"deleted": name}


@router.post("/evaluate")
def evaluate(body: EvaluateRequest, request: Request):
    classifier = active_classifier(request)
    folder = confined(request, body.dir)
    questions_file = confined(request, body.questions_path, ".json")
    try:
        questions = read_json(questions_file)
    except (OSError, ValueError) as error:
        raise HTTPException(status_code=400, detail=f"cannot read questions: {error}") from error
    if not isinstance(questions, dict):
        raise HTTPException(status_code=400, detail="questions must be a JSON object")
    errors = question_errors(questions)
    if errors:
        raise HTTPException(status_code=400, detail=errors)

    results = []
    for path in sorted(folder.glob("*.json")) if folder.is_dir() else []:
        entry = {"file": path.name, "id": None, "state": None, "result": None, "error": None}
        try:
            case = read_json(path)
            if not isinstance(case, dict):
                raise ValueError("a case must be a JSON object")
            entry["id"], entry["state"] = case.get("id"), case.get("state")
            if entry["state"] is None:
                entry["error"] = "no 'state' field"
            else:
                check_limits(entry["state"], questions)
                entry["result"] = classifier.prediction(entry["state"], questions)
        except (OSError, ValueError, KeyError) as error:
            entry["error"] = str(error)
        results.append(entry)
    return results


# ---------- app ----------


def create_app(
    root: Path | str | None = None,
    state_dir: Path | str | None = None,
    scripts: dict[str, Path] | None = None,
    web_dist: Path | str | None = WEB_DIST,
) -> FastAPI:
    """Build the studio app. Defaults come from FALCO_STUDIO_ROOT and FALCO_STUDIO_STATE."""
    root = Path(root or os.environ.get("FALCO_STUDIO_ROOT") or Path.cwd()).resolve()
    state_dir = Path(state_dir or os.environ.get("FALCO_STUDIO_STATE") or ".falco_studio")
    if not state_dir.is_absolute():
        state_dir = root / state_dir

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        app.state.jobs.shutdown()
        app.state.classifier = None

    app = FastAPI(title="Falco Studio", lifespan=lifespan)
    app.state.root = root
    app.state.jobs = JobManager(root, state_dir, scripts=scripts)
    app.state.classifier = None
    app.state.active_model = None
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    if web_dist is not None and not Path(web_dist).is_absolute():
        web_dist = root / web_dist
    if web_dist is not None and Path(web_dist).is_dir():
        app.mount("/", StaticFiles(directory=web_dist, html=True), name="web")
    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8001)
