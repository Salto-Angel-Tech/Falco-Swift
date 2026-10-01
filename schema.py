import json

OPCIONES_NOUL = ["sí" , "no"]
TIPOS = ["noul" , "choice" , "score"]

def validate_question(name : str , question : dict) -> None:
    types = question.get("type")
    if types not in TIPOS:
        raise ValueError(f'{types} is not a valid type')
    if not question.get("instructions"):
        raise ValueError(f'{name} is not a valid question')
    if types == "choice" and len(question.get('options' , []))<2:
        raise ValueError(f'{name} is not a valid choice')
    if types == "score" and len(question.get('levels' , []))<2:
        raise ValueError(f'{name} is not a valid score')

def options_of(question : dict) -> list[str]:
    types = question["type"]
    if types == "noul":
        return list(OPCIONES_NOUL)
    if types == "choice":
        return [str(o) for o in question["options"]]
    if types == "score":
        return [str(o) for o in question["levels"]]
    raise ValueError(f'{types} is not a valid option')

def text_question(types:str , instructions:str, option : str) -> str:
    tag = {
        "noul": "Afirmation" ,
        "choice": "Question",
        "score": "Score"
    }[types]
    return f"{tag} : {instructions}: {option}"

def normalize_state(state)-> str:
    if isinstance(state,str):
        return state.strip()
    return json.dumps(state, ensure_ascii=False , sort_keys=True)