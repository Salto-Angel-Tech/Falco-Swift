import os
from types import SimpleNamespace

import pytest

import falco.labelling.teachers as teachers
from falco.labelling.teachers import (
    AnthropicTeacher,
    OpenAICompatibleTeacher,
    TransientError,
    ask,
    build_teacher,
)

# ---------- fakes ----------


class FakeAnthropicMessages:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


def anthropic_response(text="hi", stop_reason="end_turn"):
    return SimpleNamespace(
        stop_reason=stop_reason,
        stop_details=None,
        content=[SimpleNamespace(type="text", text=text)],
    )


class FakeCompletions:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


def openai_response(content="hi", finish_reason="stop", refusal=None):
    message = SimpleNamespace(content=content, refusal=refusal)
    return SimpleNamespace(choices=[SimpleNamespace(message=message, finish_reason=finish_reason)])


def openai_client(response):
    completions = FakeCompletions(response)
    return SimpleNamespace(chat=SimpleNamespace(completions=completions)), completions


# ---------- anthropic ----------


def test_anthropic_teacher_joins_text_blocks_and_sends_effort():
    messages = FakeAnthropicMessages(anthropic_response("answer"))
    teacher = AnthropicTeacher(SimpleNamespace(messages=messages), "claude-sonnet-5", effort="low")

    assert teacher.complete("prompt", 100) == "answer"
    assert messages.calls[0]["model"] == "claude-sonnet-5"
    assert messages.calls[0]["output_config"] == {"effort": "low"}
    assert messages.calls[0]["messages"] == [{"role": "user", "content": "prompt"}]


def test_anthropic_teacher_omits_effort_when_unset():
    messages = FakeAnthropicMessages(anthropic_response())
    AnthropicTeacher(SimpleNamespace(messages=messages), "m", effort=None).complete("p", 10)

    assert "output_config" not in messages.calls[0]


def test_anthropic_teacher_rejects_truncated_reply():
    messages = FakeAnthropicMessages(anthropic_response(stop_reason="max_tokens"))
    teacher = AnthropicTeacher(SimpleNamespace(messages=messages), "m")

    with pytest.raises(RuntimeError, match="truncated"):
        teacher.complete("p", 10)


# ---------- openai compatible ----------


def test_openai_teacher_returns_message_content():
    client, completions = openai_client(openai_response("answer"))
    teacher = OpenAICompatibleTeacher(client, "llama3.1", max_tokens_param="max_tokens")

    assert teacher.complete("prompt", 100) == "answer"
    call = completions.calls[0]
    assert call["model"] == "llama3.1"
    assert call["max_tokens"] == 100
    assert call["messages"] == [{"role": "user", "content": "prompt"}]
    assert "reasoning_effort" not in call


def test_openai_teacher_sends_effort_and_custom_token_param():
    client, completions = openai_client(openai_response())
    teacher = OpenAICompatibleTeacher(
        client, "gpt-5", effort="high", max_tokens_param="max_completion_tokens"
    )
    teacher.complete("p", 50)

    assert completions.calls[0]["reasoning_effort"] == "high"
    assert completions.calls[0]["max_completion_tokens"] == 50
    assert "max_tokens" not in completions.calls[0]


def test_openai_teacher_rejects_truncated_reply():
    client, _ = openai_client(openai_response(finish_reason="length"))

    with pytest.raises(RuntimeError, match="truncated"):
        OpenAICompatibleTeacher(client, "m").complete("p", 10)


def test_openai_teacher_rejects_refusal():
    client, _ = openai_client(openai_response(content=None, refusal="no"))

    with pytest.raises(RuntimeError, match="declined"):
        OpenAICompatibleTeacher(client, "m").complete("p", 10)


# ---------- retry loop ----------


class FlakyTeacher:
    def __init__(self, failures, error=None):
        self.failures = failures
        self.error = error if error is not None else TransientError("boom")
        self.calls = 0

    def complete(self, prompt, max_tokens):
        self.calls += 1
        if self.calls <= self.failures:
            raise self.error
        return "ok"


def test_ask_retries_transient_errors(monkeypatch):
    monkeypatch.setattr(teachers.time, "sleep", lambda _: None)
    teacher = FlakyTeacher(failures=2)

    assert ask(teacher, "p", 10, attempts=4) == "ok"
    assert teacher.calls == 3


def test_ask_gives_up_after_attempts(monkeypatch):
    monkeypatch.setattr(teachers.time, "sleep", lambda _: None)
    teacher = FlakyTeacher(failures=10)

    with pytest.raises(RuntimeError, match="failed 3 times"):
        ask(teacher, "p", 10, attempts=3)
    assert teacher.calls == 3


def test_ask_does_not_retry_fatal_errors():
    teacher = FlakyTeacher(failures=1, error=ValueError("bad request"))

    with pytest.raises(ValueError):
        ask(teacher, "p", 10)
    assert teacher.calls == 1


@pytest.mark.parametrize("attempts", [0, -1])
def test_ask_rejects_non_positive_attempts(attempts):
    teacher = FlakyTeacher(failures=0)

    with pytest.raises(ValueError, match="attempts"):
        ask(teacher, "p", 10, attempts=attempts)
    assert teacher.calls == 0


# ---------- factory ----------


def test_build_teacher_rejects_unknown_provider():
    with pytest.raises(ValueError, match="unknown provider"):
        build_teacher("nope", "m")


def test_build_teacher_openai_compatible_uses_base_url_and_key():
    teacher = build_teacher(
        "openai", "llama3.1", base_url="http://localhost:11434/v1", api_key="ollama"
    )

    assert isinstance(teacher, OpenAICompatibleTeacher)
    assert str(teacher.client.base_url).startswith("http://localhost:11434/v1")
    assert teacher.max_tokens_param == "max_tokens"


def test_build_teacher_official_openai_uses_max_completion_tokens():
    teacher = build_teacher("openai", "gpt-5", api_key="sk-test")

    assert teacher.max_tokens_param == "max_completion_tokens"


def test_build_teacher_anthropic():
    teacher = build_teacher("anthropic", "claude-sonnet-5", api_key="sk-ant-test", effort="low")

    assert isinstance(teacher, AnthropicTeacher)
    assert teacher.effort == "low"


# ---------- gemini ----------


def test_build_teacher_gemini_uses_google_endpoint_and_gemini_key(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-test-key")

    teacher = build_teacher("gemini", "gemini-3.8-flash", effort="low")

    assert isinstance(teacher, OpenAICompatibleTeacher)
    assert str(teacher.client.base_url) == teachers.GEMINI_BASE_URL
    assert teacher.client.api_key == "gemini-test-key"
    assert teacher.max_tokens_param == "max_tokens"
    assert teacher.effort == "low"


def test_load_environment_reads_project_dotenv_without_overwriting_exported_values(
    tmp_path, monkeypatch
):
    env_file = tmp_path / ".env"
    env_file.write_text("GEMINI_API_KEY=from-dotenv\n")
    monkeypatch.setattr(teachers, "ENV_FILE", env_file)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    teachers.load_environment()

    assert os.environ["GEMINI_API_KEY"] == "from-dotenv"
    monkeypatch.setenv("GEMINI_API_KEY", "exported-value")
    teachers.load_environment()
    assert os.environ["GEMINI_API_KEY"] == "exported-value"


def test_build_teacher_gemini_explicit_key_and_base_url_win(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "from-env")

    teacher = build_teacher("gemini", "m", api_key="explicit", base_url="https://proxy.test/v1/")

    assert teacher.client.api_key == "explicit"
    assert str(teacher.client.base_url) == "https://proxy.test/v1/"


def test_build_teacher_gemini_requires_a_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    with pytest.raises(SystemExit, match="GEMINI_API_KEY"):
        build_teacher("gemini", "m")


# ---------- openrouter ----------


def test_build_teacher_openrouter_uses_openrouter_endpoint_and_key(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "openrouter-test-key")

    teacher = build_teacher("openrouter", "deepseek/deepseek-chat", effort="low")

    assert isinstance(teacher, OpenAICompatibleTeacher)
    assert str(teacher.client.base_url) == teachers.OPENROUTER_BASE_URL
    assert teacher.client.api_key == "openrouter-test-key"
    assert teacher.max_tokens_param == "max_tokens"
    assert teacher.effort == "low"


def test_build_teacher_openrouter_explicit_key_and_base_url_win(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "from-env")

    teacher = build_teacher(
        "openrouter", "m", api_key="explicit", base_url="https://proxy.test/v1/"
    )

    assert teacher.client.api_key == "explicit"
    assert str(teacher.client.base_url) == "https://proxy.test/v1/"


def test_build_teacher_openrouter_requires_a_key(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    with pytest.raises(SystemExit, match="OPENROUTER_API_KEY"):
        build_teacher("openrouter", "m")
