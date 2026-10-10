"""Label states with a teacher LLM and write the training set for the student model.

Each output row is one (state, question) pair with a target probability
distribution over the question options, ready for train.py.

The teacher can be any model: Claude through the Anthropic API, or anything that
speaks the OpenAI Chat Completions protocol (OpenAI, Gemini, Groq, OpenRouter,
DeepSeek, Ollama, vLLM, LM Studio...). Flags fall back to FALCO_PROVIDER,
FALCO_MODEL, FALCO_BASE_URL and FALCO_API_KEY_ENV.

Examples:
    python tag.py --questions questions.json --generate 200
    python tag.py --questions questions.json --states states.txt --output data.jsonl
    python tag.py --questions questions.json --generate 200 --provider openai --model gpt-5
    python tag.py --questions questions.json --generate 200 --provider openai \\
        --base-url http://localhost:11434/v1 --model llama3.1
    python tag.py --questions questions.json --generate 200 --provider openai \\
        --base-url https://generativelanguage.googleapis.com/v1beta/openai/ \\
        --model gemini-2.5-flash --api-key-env GEMINI_API_KEY
"""

import argparse
import json
import os
import random
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from schema import normalize_state, options_of, validate_question
from teachers import PROVIDERS, Teacher, ask, build_teacher

DEFAULT_MODELS = {"anthropic": "claude-sonnet-5", "openai": "gpt-5"}

EPS = 1e-3
TRUE_ALIASES = ("true", "yes", "si", "sí", "1")
LABEL_MAX_TOKENS = 4000
GENERATE_MAX_TOKENS = 16000
DIVERSITY_AXES = (
    "very short messages, almost telegraphic",
    "long messages with several mixed problems",
    "informal tone, typos and missing accents",
    "formal and corporate tone",
    "angry or passive-aggressive tone",
    "confused users who cannot describe the problem",
    "messages that mention money, invoices or refunds only in passing",
    "messages that fit no category well",
    "messages written in a hurry from a phone",
)


# ---------- parsing helpers (LLM independent, easy to unit test) ----------

def extract_json(text: str):
    """Extract the first JSON object/array from a reply, ignoring ```json fences and prose."""
    text = re.sub(r"```(?:json)?", "", text)
    start = min((i for i in (text.find("{"), text.find("[")) if i != -1), default=-1)
    if start == -1:
        raise ValueError("no JSON found in the reply")
    closing = "}" if text[start] == "{" else "]"
    end = text.rfind(closing)
    if end < start:
        raise ValueError("unterminated JSON in the reply")
    return json.loads(text[start:end + 1])


def true_probability(options: list[str], answer) -> float:
    """Read the probability of the affirmation being true out of a noul answer."""
    if isinstance(answer, dict):
        lowered = {str(k).strip().lower(): v for k, v in answer.items()}
        for key in (options[0].strip().lower(), *TRUE_ALIASES):
            if key in lowered:
                answer = lowered[key]
                break
        else:
            raise ValueError(f"no true/false key in {sorted(lowered)}")
    return min(max(float(answer), EPS), 1 - EPS)


def to_distribution(question: dict, answer) -> list[float]:
    """Turn the teacher answer into a valid probability vector over the question options."""
    options = options_of(question)
    if question["type"] == "noul":
        p = true_probability(options, answer)
        return [p, 1 - p]
    if not isinstance(answer, dict):
        raise ValueError(f"expected an object {{option: probability}}, got {type(answer).__name__}")
    lowered = {str(k).strip().lower(): v for k, v in answer.items()}
    if not any(o.strip().lower() in lowered for o in options):
        raise ValueError(f"none of the options {options} appear in {sorted(lowered)}")
    raw = [max(float(lowered.get(o.strip().lower(), 0.0)), 0.0) + EPS for o in options]
    total = sum(raw)
    return [v / total for v in raw]


def describe_questions(questions: dict) -> str:
    lines = []
    for name, question in questions.items():
        if question["type"] == "noul":
            fmt = "a number between 0 and 1 = probability that the affirmation is true"
        else:
            fmt = ("an object {option: probability} summing to 1, with exactly these keys: "
                   + json.dumps(options_of(question), ensure_ascii=False))
            if question["type"] == "score":
                fmt += " (levels ordered from lowest to highest)"
        lines.append(f'- "{name}" ({question["type"]}): {question["instructions"]}\n  Format: {fmt}')
    return "\n".join(lines)


def diversity_hint() -> str:
    """Sampling knobs are gone on current models, so we vary the prompt instead."""
    return "; ".join(random.sample(DIVERSITY_AXES, 3))


# ---------- LLM calls ----------

def generate_states(teacher: Teacher, questions: dict, domain: str, n: int,
                    batch_size: int = 25, max_failures: int = 5) -> list[str]:
    """Generate synthetic states. Returns fewer than n if generation keeps failing."""
    states: list[str] = []
    seen: set[str] = set()
    failures = 0
    while len(states) < n:
        k = min(batch_size, n - len(states))
        prompt = (
            f"Generate {k} realistic and VERY varied examples of: {domain}.\n"
            f"Emphasise these axes in this batch: {diversity_hint()}.\n"
            "Vary length, tone (formal, informal, with typos) and clarity (obvious, ambiguous "
            "and misleading cases). Include some that fit no category well. Make sure you cover "
            f"every possible answer of these questions:\n{describe_questions(questions)}\n\n"
            "Reply ONLY with a JSON array of strings, nothing else."
        )
        try:
            batch = extract_json(ask(teacher, prompt, GENERATE_MAX_TOKENS))
            fresh = [s.strip() for s in batch if isinstance(s, str) and s.strip()]
        except Exception as error:
            failures += 1
            print(f"  batch discarded ({failures}/{max_failures}): {error}")
            if failures >= max_failures:
                print(f"  giving up on generation with {len(states)}/{n} states")
                break
            continue
        for state in fresh:
            if state not in seen:
                seen.add(state)
                states.append(state)
        print(f"  generated {len(states)}/{n}")
    return states[:n]


def label_state(teacher: Teacher, questions: dict, state: str) -> list[dict]:
    """Ask the teacher for every question about one state and build its training rows."""
    prompt = (
        "You are an expert, WELL CALIBRATED annotator. Read the STATE and answer each question "
        "with probabilities. Use intermediate values when there is real ambiguity; use values "
        "close to 0 or 1 only when the answer is evident.\n\n"
        f"STATE:\n<<<\n{state}\n>>>\n\n"
        f"QUESTIONS:\n{describe_questions(questions)}\n\n"
        "Reply ONLY with a JSON object whose keys are the question names."
    )
    answer = extract_json(ask(teacher, prompt, LABEL_MAX_TOKENS))
    if not isinstance(answer, dict):
        raise ValueError(f"expected a JSON object, got {type(answer).__name__}")
    rows = []
    for name, question in questions.items():
        if name not in answer:
            print(f'  warning: the teacher skipped "{name}"')
            continue
        rows.append({
            "state": state,
            "question": name,
            "type": question["type"],
            "instructions": question["instructions"],
            "options": options_of(question),
            "target": [round(x, 5) for x in to_distribution(question, answer[name])],
        })
    if not rows:
        raise ValueError("the teacher answered none of the questions")
    return rows


# ---------- input / resume ----------

def read_states(path: str) -> list[str]:
    text = Path(path).read_text(encoding="utf-8")
    if path.endswith(".jsonl"):
        return [normalize_state(json.loads(line)["state"])
                for line in text.splitlines() if line.strip()]
    return [normalize_state(line) for line in text.splitlines() if line.strip()]


def load_done(path: Path) -> dict[str, set[str]]:
    """Question names already labelled per state, so an interrupted run resumes exactly."""
    done: dict[str, set[str]] = {}
    if not path.exists():
        return done
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue  # half-written line from a killed run
        done.setdefault(row["state"], set()).add(row["question"])
    return done


def pending_work(states: list[str], questions: dict,
                 done: dict[str, set[str]]) -> list[tuple[str, dict]]:
    """Pair each state with the questions it still misses, keeping input order."""
    work = []
    for state in dict.fromkeys(states):
        missing = {n: q for n, q in questions.items() if n not in done.get(state, ())}
        if missing:
            work.append((state, missing))
    return work


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--questions", required=True, help="JSON file with the questions")
    ap.add_argument("--states", help=".txt file (one per line) or .jsonl with a 'state' field")
    ap.add_argument("--generate", type=int, default=0, help="number of synthetic states to generate")
    ap.add_argument("--domain", default="customer messages sent to a support team")
    ap.add_argument("--output", default="data.jsonl")
    ap.add_argument("--provider", choices=PROVIDERS,
                    default=os.environ.get("FALCO_PROVIDER", "anthropic"),
                    help="teacher API: anthropic, or openai for any OpenAI compatible endpoint")
    ap.add_argument("--model", default=os.environ.get("FALCO_MODEL"),
                    help=f"teacher model (default per provider: {DEFAULT_MODELS})")
    ap.add_argument("--base-url", default=os.environ.get("FALCO_BASE_URL"),
                    help="API endpoint, e.g. http://localhost:11434/v1 for Ollama")
    ap.add_argument("--api-key-env", default=os.environ.get("FALCO_API_KEY_ENV"),
                    help="env variable holding the API key (default: the SDK's own)")
    ap.add_argument("--effort", choices=["minimal", "low", "medium", "high", "xhigh", "max"],
                    help="reasoning effort; anthropic defaults to low, openai sends none")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--max-retries", type=int, default=3, help="SDK level retries per request")
    args = ap.parse_args()

    api_key = None
    if args.api_key_env:
        api_key = os.environ.get(args.api_key_env)
        if not api_key:
            raise SystemExit(f"the environment variable {args.api_key_env} is empty or unset")
    effort = args.effort or ("low" if args.provider == "anthropic" else None)
    teacher = build_teacher(args.provider, args.model or DEFAULT_MODELS[args.provider],
                            base_url=args.base_url, api_key=api_key, effort=effort,
                            max_retries=args.max_retries)

    questions = json.loads(Path(args.questions).read_text(encoding="utf-8"))
    for name, question in questions.items():
        validate_question(name, question)

    states = read_states(args.states) if args.states else []
    if args.generate:
        print(f"Generating {args.generate} synthetic states...")
        fresh = generate_states(teacher, questions, args.domain, args.generate)
        with open("generated_states.txt", "a", encoding="utf-8") as f:  # keep them for reuse
            f.write("".join(s.replace("\n", " ") + "\n" for s in fresh))
        states += fresh
    if not states:
        raise SystemExit("no states: use --states and/or --generate")

    output = Path(args.output)
    done = load_done(output)
    work = pending_work(states, questions, done)
    print(f"Labelling {len(work)} states ({len(done)} already in {output})...")

    ok = failed = 0
    with output.open("a", encoding="utf-8") as f, ThreadPoolExecutor(args.threads) as pool:
        futures = {
            pool.submit(label_state, teacher, missing, state): state
            for state, missing in work
        }
        for future in as_completed(futures):
            try:
                for row in future.result():
                    f.write(json.dumps(row, ensure_ascii=False) + "\n")
                f.flush()
                ok += 1
            except Exception as error:
                failed += 1
                print(f"  failed: {type(error).__name__}: {error}")
            if (ok + failed) % 50 == 0:
                print(f"  {ok + failed}/{len(work)}")
    print(f"Done: {ok} states labelled, {failed} failed -> {output}")


if __name__ == "__main__":
    main()
