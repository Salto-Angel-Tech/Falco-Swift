"""Step 3: serve the trained student model over HTTP.

    uvicorn main:app --port 8000

The model folder comes from the MODEL_S1 environment variable (default: model_s1).
"""

import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

from model import Classifier

MODEL_FOLDER = os.environ.get("MODEL_S1", "model_s1")


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


app = FastAPI(title="My System One", lifespan=lifespan)


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


@app.post("/v1/decide")
def decide(payload: DecideRequest, request: Request):
    try:
        return request.app.state.classifier.prediction(payload.state, payload.questions)
    except (ValueError, KeyError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
