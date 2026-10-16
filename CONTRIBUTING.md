# Contributing to Falco

Thanks for your interest in Falco! Bug reports, docs fixes and pull requests are all welcome.
By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

Falco uses [uv](https://docs.astral.sh/uv/) and Python 3.13.

```bash
git clone https://github.com/Salto-Angel-Tech/Falco-Swift.git
cd Falco-Swift
uv sync --extra openai
```

## Tests and linting

```bash
uv run pytest                  # unit tests: no network, no API keys, no GPU
uv run ruff check .            # lint
uv run ruff format .           # format (CI runs `ruff format --check .`)
```

CI runs the same three commands on every push and pull request; please make sure they pass
locally first. New behavior should come with tests, and tests must not call real LLM
providers or load real model weights: use fakes like the ones in `tests/`.

## Do not change the text the model sees

Falco's student model is trained on text pairs built by `schema.text_question` and on the
fixed option lists in `src/falco/questions/schema.py`. Changing any of these silently
breaks every model that was already trained:

- the tags in `text_question` (`Afirmation`, `Question`, `Score`, including the spelling)
- the `noul` options `["sí", "no"]` and the type names `noul`, `choice`, `score`
- the separators and spacing in `"<Tag> : <instructions>: <option>"`
- `normalize_state` (JSON states are serialized with sorted keys)
- the response keys of `POST /v1/decide`

`tests/questions/test_schema.py` pins this text. If you think one of these should change, open an
issue first: it needs a migration plan and a version bump.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) in English, for example:

```
feat(tag): add a retry budget per run
fix(api): return 400 for empty option lists
docs: explain calibration in the README
```

Keep each commit a single reviewable unit, with its tests and docs.

## Pull requests

1. Fork the repository and create a branch from `master` (`feat/...`, `fix/...`, `docs/...`).
2. Make your change with tests, and run tests and ruff locally.
3. Open a pull request using the template; link the issue it solves.
4. A maintainer reviews it; please keep the discussion on the pull request.

Larger changes (new providers, model architecture, API changes) are best discussed in an
issue before you start.

## Security

Please do not report vulnerabilities in public issues; see [SECURITY.md](SECURITY.md).
