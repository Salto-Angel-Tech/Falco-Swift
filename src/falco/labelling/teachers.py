"""Teacher LLM backends used by tag.py.

A teacher is anything with ``complete(prompt, max_tokens) -> str``. Two adapters
cover practically every provider:

- ``anthropic``: the Claude Messages API.
- ``openai``: any OpenAI compatible Chat Completions endpoint (OpenAI, Groq,
  DeepSeek, Mistral, Together, Ollama, vLLM, LM Studio...), selected with
  ``base_url``.
- ``gemini``: Google Gemini through its OpenAI compatible endpoint, preset with
  Google's URL and the ``GEMINI_API_KEY`` variable.
- ``openrouter``: OpenRouter's OpenAI compatible endpoint, preset with
  OpenRouter's URL and the ``OPENROUTER_API_KEY`` variable.

Adapters raise ``TransientError`` for failures worth retrying; ``ask`` owns the
retry loop so every backend behaves the same.
"""

import os
import random
import time
from pathlib import Path
from typing import Protocol

from dotenv import load_dotenv

try:
    import anthropic
except ModuleNotFoundError:
    anthropic = None

try:
    import openai
except ModuleNotFoundError:
    openai = None

PROVIDERS = ("anthropic", "openai", "gemini", "openrouter")
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
GEMINI_KEY_ENV = "GEMINI_API_KEY"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/"
OPENROUTER_KEY_ENV = "OPENROUTER_API_KEY"
ENV_FILE = Path.cwd() / ".env"


def load_environment() -> None:
    """Load project-local environment variables without replacing exported values."""
    load_dotenv(ENV_FILE)


load_environment()


class TransientError(Exception):
    """A failure worth retrying: rate limit, timeout, connection or 5xx."""


class Teacher(Protocol):
    def complete(self, prompt: str, max_tokens: int) -> str: ...


def _classify(error, sdk):
    """Wrap retryable SDK errors in TransientError; return everything else untouched."""
    if isinstance(error, (sdk.RateLimitError, sdk.APIConnectionError, sdk.APITimeoutError)):
        return TransientError(f"{type(error).__name__}: {error}")
    if isinstance(error, sdk.APIStatusError) and error.status_code >= 500:
        return TransientError(f"{type(error).__name__}: {error}")
    return error  # bad request, auth, missing model: retrying will not help


class AnthropicTeacher:
    def __init__(self, client, model: str, effort: str | None = None):
        self.client = client
        self.model = model
        self.effort = effort

    def complete(self, prompt: str, max_tokens: int) -> str:
        kwargs = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if self.effort:
            kwargs["output_config"] = {"effort": self.effort}
        try:
            response = self.client.messages.create(**kwargs)
        except Exception as error:
            if anthropic is None:
                raise
            raise _classify(error, anthropic) from error
        if response.stop_reason == "refusal":
            raise RuntimeError(f"teacher declined the request: {response.stop_details}")
        if response.stop_reason == "max_tokens":
            raise RuntimeError(f"reply truncated at max_tokens={max_tokens}")
        return "".join(b.text for b in response.content if b.type == "text")


class OpenAICompatibleTeacher:
    def __init__(
        self, client, model: str, effort: str | None = None, max_tokens_param: str = "max_tokens"
    ):
        self.client = client
        self.model = model
        self.effort = effort
        self.max_tokens_param = max_tokens_param

    def complete(self, prompt: str, max_tokens: int) -> str:
        kwargs = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            self.max_tokens_param: max_tokens,
        }
        if self.effort:
            kwargs["reasoning_effort"] = self.effort
        try:
            response = self.client.chat.completions.create(**kwargs)
        except Exception as error:
            if openai is None:
                raise
            raise _classify(error, openai) from error
        choice = response.choices[0]
        if getattr(choice.message, "refusal", None):
            raise RuntimeError(f"teacher declined the request: {choice.message.refusal}")
        if choice.finish_reason == "content_filter":
            raise RuntimeError("teacher declined the request: content_filter")
        if choice.finish_reason == "length":
            raise RuntimeError(f"reply truncated at {self.max_tokens_param}={max_tokens}")
        return choice.message.content or ""


def ask(teacher: Teacher, prompt: str, max_tokens: int, attempts: int = 4) -> str:
    """One teacher call. Retries transient failures only; other errors surface immediately."""
    if attempts < 1:
        raise ValueError(f"attempts must be at least 1, got {attempts}")
    for attempt in range(attempts):
        try:
            return teacher.complete(prompt, max_tokens)
        except TransientError as error:
            if attempt == attempts - 1:
                raise RuntimeError(f"the teacher failed {attempts} times") from error
            delay = 2**attempt + random.random()
            print(f"  warning: {error}, retrying in {delay:.0f}s")
            time.sleep(delay)


def build_teacher(
    provider: str,
    model: str,
    *,
    base_url: str | None = None,
    api_key: str | None = None,
    effort: str | None = None,
    max_retries: int = 3,
) -> Teacher:
    """Create the teacher for a provider. ``api_key`` falls back to the SDK's env variable."""
    if provider == "anthropic":
        if anthropic is None:
            raise SystemExit("the anthropic package is not installed: pip install anthropic")
        client = anthropic.Anthropic(api_key=api_key, base_url=base_url, max_retries=max_retries)
        return AnthropicTeacher(client, model, effort)
    if provider in ("openai", "gemini", "openrouter"):
        if openai is None:
            raise SystemExit("the openai package is not installed: pip install 'falco[openai]'")
        if provider == "gemini":
            base_url = base_url or GEMINI_BASE_URL
            api_key = api_key or os.environ.get(GEMINI_KEY_ENV)
            if not api_key:
                raise SystemExit(f"set {GEMINI_KEY_ENV} or pass --api-key-env for Gemini")
        elif provider == "openrouter":
            base_url = base_url or OPENROUTER_BASE_URL
            api_key = api_key or os.environ.get(OPENROUTER_KEY_ENV)
            if not api_key:
                raise SystemExit(f"set {OPENROUTER_KEY_ENV} or pass --api-key-env for OpenRouter")
        # Local servers (Ollama, vLLM, LM Studio) accept any key but the SDK demands one.
        elif api_key is None and base_url and not os.environ.get("OPENAI_API_KEY"):
            api_key = "not-needed"
        client = openai.OpenAI(api_key=api_key, base_url=base_url, max_retries=max_retries)
        # Official OpenAI reasoning models reject max_tokens; most compatible servers
        # only understand max_tokens.
        param = "max_tokens" if base_url else "max_completion_tokens"
        return OpenAICompatibleTeacher(client, model, effort, max_tokens_param=param)
    raise ValueError(f"unknown provider {provider!r}, expected one of {PROVIDERS}")
