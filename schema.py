import json

NOUL_OPTIONS = ["sí", "no"]
QUESTION_TYPES = ["noul", "choice", "score"]


def validate_question(name: str, question: dict) -> None:
    question_type = question.get("type")
    if question_type not in QUESTION_TYPES:
        raise ValueError(f"{question_type} is not a valid type")
    if not question.get("instructions"):
        raise ValueError(f"{name} is not a valid question")
    if question_type == "choice" and len(question.get("options", [])) < 2:
        raise ValueError(f"{name} is not a valid choice")
    if question_type == "score" and len(question.get("levels", [])) < 2:
        raise ValueError(f"{name} is not a valid score")


def options_of(question: dict) -> list[str]:
    question_type = question["type"]
    if question_type == "noul":
        return list(NOUL_OPTIONS)
    if question_type == "choice":
        return [str(o) for o in question["options"]]
    if question_type == "score":
        return [str(o) for o in question["levels"]]
    raise ValueError(f"{question_type} is not a valid option")


def text_question(question_type: str, instructions: str, option: str) -> str:
    tag = {"noul": "Afirmation", "choice": "Question", "score": "Score"}[question_type]
    return f"{tag} : {instructions}: {option}"


def normalize_state(state) -> str:
    if isinstance(state, str):
        return state.strip()
    return json.dumps(state, ensure_ascii=False, sort_keys=True)
