import json

from tag import generate_states, label_state


class ScriptedTeacher:
    """Any model works as a teacher as long as it answers complete(prompt, max_tokens)."""

    def __init__(self, *replies):
        self.replies = list(replies)
        self.prompts = []

    def complete(self, prompt, max_tokens):
        self.prompts.append(prompt)
        return self.replies.pop(0)


QUESTIONS = {
    "urgent": {"type": "noul", "instructions": "the customer needs an answer today"},
}


def test_label_state_works_with_any_teacher():
    teacher = ScriptedTeacher('```json\n{"urgent": 0.9}\n```')

    rows = label_state(teacher, QUESTIONS, "my server is down")

    assert len(rows) == 1
    assert rows[0]["question"] == "urgent"
    assert rows[0]["target"][0] == 0.9
    assert "my server is down" in teacher.prompts[0]


def test_generate_states_works_with_any_teacher():
    teacher = ScriptedTeacher(json.dumps(["a", "b", "a"]))

    assert generate_states(teacher, QUESTIONS, "support messages", 2) == ["a", "b"]
