# Falco

[![CI](https://github.com/Salto-Angel-Tech/Falco-Swift/actions/workflows/ci.yml/badge.svg)](https://github.com/Salto-Angel-Tech/Falco-Swift/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Falco distills a large language model into a small, fast and **calibrated** classifier.
A teacher LLM labels text with probabilities, a multilingual encoder (the "System One"
student) learns to reproduce them, and a FastAPI service answers your questions about
new text in milliseconds, without calling any LLM at inference time.

```
questions.json ──► tag.py ──► data.jsonl ──► train.py ──► model_s1/ ──► main.py (HTTP)
                  (teacher LLM)             (student encoder)          /v1/decide
```

## Quick path

```bash
uv sync --extra openai                     # dependencies (+ OpenAI/Gemini support)
export GEMINI_API_KEY=...                  # or ANTHROPIC_API_KEY / OPENAI_API_KEY

# 1. Label: generate 200 synthetic states and label them with the teacher
python tag.py --questions questions.json --generate 200 --provider gemini

# 2. Train and calibrate the student
python train.py --data data.jsonl --output model_s1

# 3. Serve it
uvicorn main:app --port 8000
```

Then ask it something:

```bash
curl -s localhost:8000/v1/decide -H 'Content-Type: application/json' -d @- <<'EOF'
{
  "state": "I was charged twice this month and nobody answers, fix it TODAY",
  "questions": {
    "urgent":   {"type": "noul",   "instructions": "The message conveys urgency"},
    "category": {"type": "choice", "instructions": "Main area of the problem",
                 "options": ["billing", "technical", "account", "other"]},
    "frustration": {"type": "score", "instructions": "Customer frustration level",
                    "levels": ["none", "low", "medium", "high", "extreme"]}
  }
}
EOF
```

---

## Core concepts

| Term | Meaning |
|------|---------|
| **State** | The input to judge: a string, or any JSON value (serialized with sorted keys). |
| **Question** | What you want to know about the state. Has a `type` and `instructions`. |
| **Teacher** | The LLM that labels states with probabilities during `tag.py`. Any provider. |
| **Student / System One** | The fine-tuned encoder that answers at inference time. |
| **Calibration** | A single temperature fitted after training so that "0.9" is right ~90% of the time. |

### Question types

Questions live in a JSON object keyed by question name (see `questions.json`).

| Type | Required fields | Options the model scores | Output |
|------|-----------------|--------------------------|--------|
| `noul` | `instructions` (an affirmation) | `["sí", "no"]` | probability the affirmation is true |
| `choice` | `instructions`, `options` (≥ 2) | each option | most likely option + distribution + confidence |
| `score` | `instructions`, `levels` (≥ 2, lowest → highest) | each level | expected level in `[0, 1]` + distribution + confidence |

```json
{
  "urgente":    {"type": "noul",   "instructions": "El mensaje transmite urgencia o sensibilidad al tiempo"},
  "categoria":  {"type": "choice", "instructions": "¿De qué área es el problema principal?",
                 "options": ["facturación", "problema técnico", "cuenta y acceso", "pregunta general", "otro"]},
  "frustracion":{"type": "score",  "instructions": "Nivel de frustración del cliente",
                 "levels": ["ninguna", "baja", "media", "alta", "extrema"]}
}
```

> Questions are part of the model input, so the API accepts any question at request time.
> Accuracy and calibration are only measured for the questions it was trained on; treat
> unseen questions as zero-shot.

---

## Step 1 — Label with a teacher (`tag.py`)

`tag.py` builds the training set: one row per `(state, question)` pair with the
teacher's probability distribution over the options.

### Choosing a teacher

The teacher is provider-agnostic. Three providers cover practically every model:

| `--provider` | Talks to | API key (default) | Default `--model` |
|--------------|----------|-------------------|-------------------|
| `anthropic` (default) | Anthropic Messages API | `ANTHROPIC_API_KEY` | `claude-sonnet-5` |
| `gemini` | Google's OpenAI-compatible endpoint | `GEMINI_API_KEY` | `gemini-3.8-flash` |
| `openai` | Any OpenAI-compatible Chat Completions API | `OPENAI_API_KEY` | `gpt-5` |

`--provider openai` plus `--base-url` reaches any compatible server:

| Server | `--base-url` |
|--------|--------------|
| OpenAI | *(omit)* |
| Ollama | `http://localhost:11434/v1` |
| LM Studio | `http://localhost:1234/v1` |
| vLLM | `http://localhost:8000/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| DeepSeek | `https://api.deepseek.com/v1` |

```bash
# Local model with Ollama (no key needed)
python tag.py --questions questions.json --generate 200 --provider openai \
    --base-url http://localhost:11434/v1 --model llama3.1

# OpenRouter, key stored in a custom variable
python tag.py --questions questions.json --states states.txt --provider openai \
    --base-url https://openrouter.ai/api/v1 --model <model-id> --api-key-env OPENROUTER_API_KEY
```

### Options

| Flag | Env fallback | Default | Purpose |
|------|--------------|---------|---------|
| `--questions` | — | *required* | JSON file with the questions |
| `--states` | — | — | `.txt` (one state per line) or `.jsonl` with a `state` field |
| `--generate N` | — | `0` | Generate `N` synthetic states with the teacher |
| `--domain` | — | customer support messages | What the synthetic states should look like |
| `--output` | — | `data.jsonl` | Training set (appended, resumable) |
| `--provider` | `FALCO_PROVIDER` | `anthropic` | `anthropic`, `gemini` or `openai` |
| `--model` | `FALCO_MODEL` | per provider | Teacher model id |
| `--base-url` | `FALCO_BASE_URL` | provider default | API endpoint |
| `--api-key-env` | `FALCO_API_KEY_ENV` | SDK default | Name of the env variable holding the key |
| `--effort` | — | `low` (anthropic), unset (others) | Reasoning effort: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` |
| `--threads` | — | `4` | Parallel labelling requests |
| `--max-retries` | — | `3` | SDK-level retries per request |

Use only effort values your provider accepts (Gemini: `none`, `low`, `medium`, `high`).

### How it behaves

- **Resumable.** Rows already in `--output` are skipped per `(state, question)`; a killed
  run continues where it stopped.
- **Synthetic states** are appended to `generated_states.txt` for reuse. Each batch asks
  for 25 states and emphasizes three random diversity axes (tone, length, typos...).
- **Retries.** Rate limits, timeouts, connection errors and 5xx retry with exponential
  backoff (4 attempts). Auth errors, bad requests, refusals and truncated replies fail fast.
- **Robust parsing.** JSON is extracted from fenced or chatty replies; probabilities are
  clipped to `[0.001, 0.999]` and renormalized.

### Output row (`data.jsonl`)

```json
{"state": "my server is down", "question": "urgente", "type": "noul",
 "instructions": "El mensaje transmite urgencia...", "options": ["sí", "no"],
 "target": [0.9, 0.1]}
```

---

## Step 2 — Train the student (`train.py`)

```bash
python train.py --data data.jsonl --output model_s1
```

| Flag | Default | Purpose |
|------|---------|---------|
| `--data` | `data.jsonl` | Rows produced by `tag.py` |
| `--base` | `microsoft/mdeberta-v3-base` | Base encoder (lighter: `distilbert-base-multilingual-cased`) |
| `--output` | `model_s1` | Model folder |
| `--epochs` | `4` | Training epochs |
| `--lr` | `2e-5` | Encoder learning rate (the head uses 20×) |
| `--batch` | `8` | Questions per batch (each expands into its options) |
| `--max-len` | `384` | Max tokens per (state, option) pair; the state is truncated first |
| `--val` | `0.1` | Validation fraction |
| `--seed` | `42` | Reproducibility |

### What happens

1. **Load and split.** Invalid rows are dropped (targets must sum to 1 ± 0.01). The split
   is **by state**, so validation never sees a training state. At least 2 distinct
   states are required.
2. **Train.** Soft cross-entropy against the teacher's full distribution, so the student
   learns the uncertainty, not just the winning option. AdamW, linear warmup (6%),
   gradient clipping at 1.0.
3. **Checkpoint.** After each epoch the validation loss, accuracy and ECE are printed; the
   best epoch is saved.
4. **Calibrate.** One temperature is fitted with L-BFGS on the validation logits and saved
   with the model. Before/after metrics are printed.

| Metric | Meaning |
|--------|---------|
| `loss` | Soft cross-entropy vs the teacher (lower is better) |
| `accuracy` | Student's top option matches the teacher's top option |
| `ece` | Expected calibration error: gap between confidence and accuracy (lower is better) |

---

## Step 3 — Serve (`main.py`)

```bash
MODEL_S1=model_s1 uvicorn main:app --port 8000
```

The model loads once at startup on CUDA, Apple MPS or CPU (in that order). If the folder
is missing the app refuses to start and tells you to run `train.py`.

### `GET /health`

```json
{"status": "ok", "model": "model_s1", "device": "cuda", "max_len": 384, "temperature": 1.2345}
```

### `POST /v1/decide`

Request:

| Field | Type | Description |
|-------|------|-------------|
| `state` | string or any JSON | The text or object to judge |
| `questions` | object | Question name → question definition (same format as `questions.json`) |

Response for the Quick path request — one entry per question (values are illustrative):

```json
{
  "urgent":   {"type": "noul", "noul": 0.93},
  "category": {"type": "choice", "choice": "billing",
               "probability": {"billing": 0.88, "technical": 0.04, "account": 0.05, "other": 0.03},
               "confidence": 0.61},
  "frustration": {"type": "score", "score": 0.81,
                  "distribution": {"none": 0.01, "low": 0.03, "medium": 0.12, "high": 0.45, "extreme": 0.39},
                  "confidence": 0.42}
}
```

| Field | Meaning |
|-------|---------|
| `noul` | Probability the affirmation is true |
| `choice` | Option with the highest probability |
| `probability` / `distribution` | Calibrated probability per option / level |
| `score` | Expected level scaled to `[0, 1]` (0 = first level, 1 = last) |
| `confidence` | `1 − normalized entropy`: 1 = certain, 0 = uniform. Not returned for `noul` |

An invalid question (unknown type, missing `instructions`, fewer than 2 options/levels)
returns **400** with the reason.

### Request limits

Every option of every question is one encoder pass, so a single oversized request could
exhaust memory. Requests over these limits are rejected with **400** before touching the
model:

| Env variable | Default | Limit |
|--------------|---------|-------|
| `FALCO_MAX_QUESTIONS` | `20` | Questions per request |
| `FALCO_MAX_OPTIONS` | `20` | Options (or levels) per question |
| `FALCO_MAX_STATE_CHARS` | `20000` | Characters in the state (JSON states are measured after serialization) |

Values must be positive integers; the app refuses to start otherwise.

---

## Step 4 — Inspect predictions (`evaluate.py`)

Drop a few hand-written cases into a folder, one JSON file each with a `state` field
(and an optional `id`), and print what the trained model answers for them:

```bash
python evaluate.py --model model_s1 --questions questions.json --cases cases
```

```json
{"id": "refund-1", "state": "I want my money back, the service never worked"}
```

This is a quick eyeball check, not a metric: use the validation numbers from `train.py`
to judge quality.

---

## How the model works

Falco is a **cross-encoder that scores options**, not a fixed-label classifier:

1. Every option of every question becomes a text pair:
   `(state, "<Tag> : <instructions>: <option>")`, with `Tag` = `Afirmation`, `Question`
   or `Score`.
2. The encoder reads the pair; the `[CLS]` vector goes through dropout + a linear layer and
   becomes one logit.
3. The logits of one question are grouped and passed through `softmax(logits / T)`, where
   `T` is the calibrated temperature.

That is why new questions and options need no new head: they are just more text.

### Model folder

```
model_s1/
├── encoder/      # fine-tuned encoder weights + tokenizer (Hugging Face format)
├── head.pt       # linear head + temperature
└── config.json   # {"max_len": 384, "temperature": 1.23}
```

---

## Project layout

| File | Role |
|------|------|
| `schema.py` | Question validation, option lists, question-to-text, state normalization |
| `teachers.py` | Teacher port and adapters (Anthropic, OpenAI-compatible, Gemini) with retries |
| `tag.py` | Step 1: synthetic generation and labelling |
| `model.py` | `SystemOne` network, save/load, `Classifier` for inference |
| `train.py` | Step 2: training, metrics and temperature calibration |
| `main.py` | Step 3: FastAPI service |
| `evaluate.py` | Step 4: print the model's answers for hand-written cases |
| `questions.json` | Example questions (Spanish customer-support domain) |
| `tests/` | Unit tests for schema, teachers, labelling, training, model math and API (no network) |

## Limitations

- **Unseen questions are zero-shot.** The API accepts any question, but accuracy and
  calibration are only measured for the questions the model was trained on.
- **The student inherits the teacher.** Labels come from an LLM; its biases and mistakes
  are distilled along with its knowledge. Check the validation metrics and inspect
  predictions (`evaluate.py`) before relying on the model.
- **No authentication.** The HTTP service is meant for a trusted network or to sit behind
  your own gateway; do not expose it directly to the internet.
- **Bounded requests.** `/v1/decide` rejects requests over the
  [request limits](#request-limits); states longer than `max_len` tokens are truncated.

## Responsible use

Falco trains a model on answers produced by a third-party LLM. Many providers restrict
using their outputs to train other models. Before labelling with `tag.py`, review the terms
of service of the provider and model you use as teacher, and make sure you have the right to
use the states you send to it (personal or confidential data included).

## Development

```bash
uv sync --extra openai
uv run pytest
uv run ruff check . && uv run ruff format --check .
```

Tests use fake clients and a fake classifier, so they need neither API keys nor a GPU.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first — especially the
part about not changing the text the model sees — and follow the
[Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately as described in
[SECURITY.md](SECURITY.md).

## License

Copyright 2026 Salto Ángel ([saltoangel.co](https://saltoangel.co)).
Licensed under the [Apache License 2.0](LICENSE).
