"""Step 4: manually inspect the trained model's predictions.

    falco evaluate --model model_s1 --questions questions.json --cases cases

Loads every *.json case under --cases (each one needs a "state" field and may
carry an "id"), runs it through the classifier with the given questions, and
prints the predicted answers next to the state so you can eyeball whether they
make sense.
"""

import argparse
import json
from pathlib import Path

from falco.inference.model import Classifier


def main(argv: list[str] | None = None):
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--model", default="model_s1")
    ap.add_argument("--questions", default="questions.json")
    ap.add_argument("--cases", default="cases", help="folder with *.json test cases")
    args = ap.parse_args(argv)

    questions = json.loads(Path(args.questions).read_text(encoding="utf-8"))
    classifier = Classifier(args.model)

    for path in sorted(Path(args.cases).glob("*.json")):
        case = json.loads(path.read_text(encoding="utf-8"))
        state = case.get("state")
        if state is None:
            print(f"== {path.name}: skipped (no 'state' field)")
            continue

        result = classifier.prediction(state, questions)
        print(f"== {path.name} ({case.get('id', '?')})")
        print(f"   {state}")
        for name, answer in result.items():
            if answer["type"] == "noul":
                verdict = "yes" if answer["noul"] >= 0.5 else "no"
                print(f"   - {name}: {verdict} (p={answer['noul']})")
            elif answer["type"] == "choice":
                print(f"   - {name}: {answer['choice']} (confidence={answer['confidence']})")
            else:
                print(f"   - {name}: score={answer['score']} (confidence={answer['confidence']})")
        print()


if __name__ == "__main__":
    main()
