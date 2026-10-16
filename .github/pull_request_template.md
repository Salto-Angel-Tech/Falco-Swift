## Summary

<!-- What changes and why. Link the issue: Closes #123 -->

## Checklist

- [ ] `uv run pytest` passes
- [ ] `uv run ruff check .` and `uv run ruff format --check .` pass
- [ ] Tests added or updated for new behavior (no network, no real model weights)
- [ ] Docs updated (README, CHANGELOG) when behavior changes
- [ ] Does **not** change the text the model sees (`src/falco/questions/schema.py` tags/options) or the `/v1/decide` response keys — or explains why below

## Notes for reviewers
