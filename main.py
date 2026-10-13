"""Step 3: serve the trained student model over HTTP.

    uvicorn main:app --port 8000

The model folder comes from the MODEL_S1 environment variable (default: model_s1).
Request size limits come from FALCO_MAX_QUESTIONS, FALCO_MAX_OPTIONS and
FALCO_MAX_STATE_CHARS.
"""

import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

from model import Classifier
from schema import normalize_state, options_of, validate_question


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


MODEL_FOLDER = os.environ.get("MODEL_S1", "model_s1")
MAX_QUESTIONS = env_limit("FALCO_MAX_QUESTIONS", 20)
MAX_OPTIONS = env_limit("FALCO_MAX_OPTIONS", 20)
MAX_STATE_CHARS = env_limit("FALCO_MAX_STATE_CHARS", 20_000)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the model once at startup instead of on every import of this module."""
    try:
        app.state.classifier = Classifier(MODEL_FOLDER)
    except (OSError, KeyError) as error:
        raise RuntimeError(
            f"cannot load the model from {MODEL_FOLDER!r}: run train.py first "
            f"or point MODEL_S1 at a trained folder ({type(error).__name__}: {error})"
        ) from error
    yield
    app.state.classifier = None


app = FastAPI(title="Falco", lifespan=lifespan)


class DecideRequest(BaseModel):
    state: Any = Field(description="the text (or JSON) to judge")
    questions: dict[str, dict] = Field(description="question name -> question definition")


@app.get("/health")
def health(request: Request):
    classifier = request.app.state.classifier
    return {
        "status": "ok",
        "model": MODEL_FOLDER,
        "device": classifier.device,
        "max_len": classifier.max_len,
        "temperature": round(float(classifier.model.temperature), 4),
    }


def check_limits(state: Any, questions: dict[str, dict]) -> None:
    """Reject requests big enough to exhaust memory or stall the model."""
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


@app.post("/v1/decide")
def decide(payload: DecideRequest, request: Request):
    try:
        check_limits(payload.state, payload.questions)
        return request.app.state.classifier.prediction(payload.state, payload.questions)
    except (ValueError, KeyError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
