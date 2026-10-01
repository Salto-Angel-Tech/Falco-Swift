"""Label states with a teacher LLM and write the training set for the student model.

Each output row is one (state, question) pair with a target probability
distribution over the question options, ready for train.py.

Examples:
    python tag.py --questions questions.json --generate 200
    python tag.py --questions questions.json --states states.txt --output data.jsonl
"""

import argparse
import json
import random
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from schema import normalize_state, options_of, validate_question

try:
    import anthropic
except ModuleNotFoundError:  # the parsing helpers stay importable without the SDK
    anthropic = None

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

def call_teacher(client, model: str, prompt: str, max_tokens: int, effort: str,
                 attempts: int = 4) -> str:
    """One teacher call. Retries transient failures only; client errors surface immediately."""
    for attempt in range(attempts):
        try:
            response = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                output_config={"effort": effort},
                messages=[{"role": "user", "content": prompt}],
            )
        except (anthropic.RateLimitError, anthropic.APIConnectionError,
                anthropic.APITimeoutError) as error:
            transient = error
        except anthropic.APIStatusError as error:
            if error.status_code < 500:
                raise  # bad request, auth, missing model: retrying will not help
            transient = error
        else:
            if response.stop_reason == "refusal":
                raise RuntimeError(f"teacher declined the request: {response.stop_details}")
            if response.stop_reason == "max_tokens":
                raise RuntimeError(f"reply truncated at max_tokens={max_tokens}")
            return "".join(b.text for b in response.content if b.type == "text")

        if attempt == attempts - 1:
            raise RuntimeError(f"the teacher failed {attempts} times") from transient
        delay = 2 ** attempt + random.random()
        print(f"  warning: {type(transient).__name__}, retrying in {delay:.0f}s")
        time.sleep(delay)


def generate_states(client, model: str, questions: dict, domain: str, n: int,
                    effort: str, batch_size: int = 25, max_failures: int = 5) -> list[str]:
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
            batch = extract_json(call_teacher(client, model, prompt, GENERATE_MAX_TOKENS, effort))
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


def label_state(client, model: str, questions: dict, state: str, effort: str) -> list[dict]:
    """Ask the teacher for every question about one state and build its training rows."""
    prompt = (
        "You are an expert, WELL CALIBRATED annotator. Read the STATE and answer each question "
        "with probabilities. Use intermediate values when there is real ambiguity; use values "
        "close to 0 or 1 only when the answer is evident.\n\n"
        f"STATE:\n<<<\n{state}\n>>>\n\n"
        f"QUESTIONS:\n{describe_questions(questions)}\n\n"
        "Reply ONLY with a JSON object whose keys are the question names."
    )
    answer = extract_json(call_teacher(client, model, prompt, LABEL_MAX_TOKENS, effort))
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
    ap.add_argument("--model", default="claude-sonnet-5", help="teacher model")
    ap.add_argument("--effort", default="low", choices=["low", "medium", "high", "xhigh", "max"])
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--max-retries", type=int, default=3, help="SDK level retries per request")
    args = ap.parse_args()

    if anthropic is None:
        raise SystemExit("the anthropic package is not installed: pip install anthropic")
    client = anthropic.Anthropic(max_retries=args.max_retries)

    questions = json.loads(Path(args.questions).read_text(encoding="utf-8"))
    for name, question in questions.items():
        validate_question(name, question)

    states = read_states(args.states) if args.states else []
    if args.generate:
        print(f"Generating {args.generate} synthetic states...")
        fresh = generate_states(client, args.model, questions, args.domain,
                                args.generate, args.effort)
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
            pool.submit(label_state, client, args.model, missing, state, args.effort): state
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
