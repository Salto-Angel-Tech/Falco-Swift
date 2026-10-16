# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Modules moved into the `falco` package under `src/`; use the `falco` CLI
  (`falco tag`, `falco train`, `falco serve`, `falco evaluate`, `falco studio`).

## [0.1.0] - 2026-10-13

First open-source release.

### Added

- `tag.py`: synthetic state generation and labelling with a provider-agnostic teacher
  (Anthropic, Gemini, OpenRouter, and any OpenAI-compatible API), resumable and with retries.
- `train.py`: soft-label distillation into a multilingual encoder, split by state, with
  loss/accuracy/ECE metrics and temperature calibration.
- `main.py`: FastAPI service with `GET /health` and `POST /v1/decide`.
- `evaluate.py`: print the model's answers for hand-written cases.
- Request limits for `/v1/decide`: `FALCO_MAX_QUESTIONS`, `FALCO_MAX_OPTIONS`,
  `FALCO_MAX_STATE_CHARS`.
- Apache-2.0 license, contributing guide, code of conduct, security policy and CI.

### Fixed

- `teachers.ask` raises `ValueError` for `attempts < 1` instead of returning `None`.

[Unreleased]: https://github.com/Salto-Angel-Tech/Falco-Swift/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Salto-Angel-Tech/Falco-Swift/releases/tag/v0.1.0
