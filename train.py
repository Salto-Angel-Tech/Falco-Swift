"""Step 2: train the student model and calibrate its probabilities.

    python train.py --data data.jsonl --output model_s1

Loss: cross entropy against the teacher's soft probabilities (not just the winning
option), so the student learns the uncertainty too. Afterwards a single temperature
is fitted on the validation split so the probabilities are calibrated: a 0.9 should
be right about 90% of the time.
"""

import argparse
import json
import random
from pathlib import Path

import torch
from torch.utils.data import DataLoader
from transformers import AutoTokenizer, get_linear_schedule_with_warmup

from schema import normalize_state, text_question
from model import SystemOne, choice_device, log_probs_by_group, tokenizer_method

TARGET_TOLERANCE = 1e-2


# ---------- data ----------

def usable_row(row) -> bool:
    if not isinstance(row, dict):
        return False
    if not all(row.get(k) for k in ("state", "question", "type", "instructions")):
        return False
    options, target = row.get("options"), row.get("target")
    if not isinstance(options, list) or not isinstance(target, list):
        return False
    if len(options) < 2 or len(target) != len(options):
        return False
    return abs(sum(target) - 1.0) <= TARGET_TOLERANCE


def load_and_split(path: str, val_frac: float, seed: int) -> tuple[list[dict], list[dict]]:
    """Split by STATE (not by row) so validation never sees a training state."""
    rows, dropped = [], 0
    with open(path, encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                dropped += 1
                continue
            if not usable_row(row):
                dropped += 1
                continue
            row["state"] = normalize_state(row["state"])
            rows.append(row)
    if dropped:
        print(f"  {dropped} unusable rows ignored")
    if not rows:
        raise SystemExit(f"no usable rows in {path}: run tag.py first")

    states = sorted({row["state"] for row in rows})
    if len(states) < 2:
        raise SystemExit(f"{len(states)} distinct state(s): cannot split, label more states")
    random.Random(seed).shuffle(states)
    n_val = min(max(1, round(len(states) * val_frac)), len(states) - 1)
    val_states = set(states[:n_val])
    train = [row for row in rows if row["state"] not in val_states]
    val = [row for row in rows if row["state"] in val_states]
    return train, val


def make_collate(tokenizer, max_len: int):
    """Each row becomes one (state, option text) pair per option, scored as a group."""
    def collate(batch):
        pairs, sizes, targets = [], [], []
        for row in batch:
            pairs += [(row["state"], text_question(row["type"], row["instructions"], option))
                      for option in row["options"]]
            sizes.append(len(row["options"]))
            targets.append(torch.tensor(row["target"], dtype=torch.float))
        return tokenizer_method(tokenizer, pairs, max_len), sizes, targets
    return collate


# ---------- loss, metrics, calibration ----------

def soft_loss(log_probs: list[torch.Tensor], targets: list[torch.Tensor]) -> torch.Tensor:
    return torch.stack([-(t * lp).sum() for lp, t in zip(log_probs, targets)]).mean()


@torch.no_grad()
def collect(model, loader, device) -> tuple[list[torch.Tensor], list[torch.Tensor]]:
    """Run the model once and keep the raw logits per group, for metrics and calibration."""
    model.eval()
    groups, targets = [], []
    for enc, sizes, batch_targets in loader:
        logits = model(**{k: v.to(device) for k, v in enc.items()}).float().cpu()
        groups += list(torch.split(logits, sizes))
        targets += batch_targets
    return groups, targets


def metrics(groups, targets, temperature: float = 1.0, n_bins: int = 10) -> dict:
    n = len(targets)
    if not n:
        return {"loss": None, "accuracy": None, "ece": None, "n": 0}
    loss, confidences, hits = 0.0, [], []
    for group, target in zip(groups, targets):
        log_probs = torch.log_softmax(group / temperature, dim=-1)
        probs = log_probs.exp()
        loss += -(target * log_probs).sum().item()
        confidences.append(probs.max().item())
        hits.append(float(probs.argmax() == target.argmax()))
    # ECE: mean gap between stated confidence and real accuracy, per confidence bin
    ece = 0.0
    for b in range(n_bins):
        idx = [i for i, c in enumerate(confidences) if b / n_bins < c <= (b + 1) / n_bins]
        if idx:
            accuracy = sum(hits[i] for i in idx) / len(idx)
            confidence = sum(confidences[i] for i in idx) / len(idx)
            ece += len(idx) / n * abs(accuracy - confidence)
    return {
        "loss": round(loss / n, 4),
        "accuracy": round(sum(hits) / n, 4),
        "ece": round(ece, 4),
        "n": n,
    }


def fit_temperature(groups, targets) -> float:
    """One scalar temperature fitted on validation logits. 1.0 means no change."""
    if not targets:
        return 1.0
    log_t = torch.zeros(1, requires_grad=True)
    opt = torch.optim.LBFGS([log_t], lr=0.05, max_iter=200)

    def closure():
        opt.zero_grad()
        t = log_t.exp()
        loss = torch.stack([-(target * torch.log_softmax(group / t, dim=-1)).sum()
                            for group, target in zip(groups, targets)]).mean()
        loss.backward()
        return loss

    opt.step(closure)
    temperature = float(log_t.detach().exp().clamp(0.05, 20.0))
    if temperature != temperature:  # NaN: the fit diverged, keep the logits untouched
        print("  warning: temperature fit diverged, keeping 1.0")
        return 1.0
    return temperature


# ---------- training ----------

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="data.jsonl")
    ap.add_argument("--base", default="microsoft/mdeberta-v3-base",
                    help="base encoder (multilingual). Lighter: distilbert-base-multilingual-cased")
    ap.add_argument("--output", default="model_s1")
    ap.add_argument("--epochs", type=int, default=4)
    ap.add_argument("--lr", type=float, default=2e-5)
    ap.add_argument("--batch", type=int, default=8,
                    help="questions per batch (each one expands into its options)")
    ap.add_argument("--max-len", type=int, default=384)
    ap.add_argument("--val", type=float, default=0.1)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    device = choice_device()
    train_rows, val_rows = load_and_split(args.data, args.val, args.seed)
    print(f"Device: {device} | train: {len(train_rows)} | validation: {len(val_rows)}")

    tokenizer = AutoTokenizer.from_pretrained(args.base)
    model = SystemOne(args.base).to(device)
    collate = make_collate(tokenizer, args.max_len)
    train_loader = DataLoader(train_rows, batch_size=args.batch, shuffle=True, collate_fn=collate)
    val_loader = DataLoader(val_rows, batch_size=args.batch * 2, shuffle=False, collate_fn=collate)

    opt = torch.optim.AdamW([
        {"params": model.encoder.parameters(), "lr": args.lr},
        {"params": model.head.parameters(), "lr": args.lr * 20},  # the head starts from scratch
    ], weight_decay=0.01)
    total_steps = max(1, len(train_loader) * args.epochs)
    sched = get_linear_schedule_with_warmup(opt, int(0.06 * total_steps), total_steps)

    best = float("inf")
    for epoch in range(1, args.epochs + 1):
        model.train()
        running = 0.0
        for step, (enc, sizes, targets) in enumerate(train_loader, 1):
            logits = model(**{k: v.to(device) for k, v in enc.items()}).float()
            loss = soft_loss(log_probs_by_group(logits, sizes),
                             [t.to(device) for t in targets])
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            running += loss.item()
            if step % 50 == 0:
                print(f"  epoch {epoch} step {step}/{len(train_loader)} loss {running / step:.4f}")

        val = metrics(*collect(model, val_loader, device))
        print(f"Epoch {epoch}: validation {val}")
        if val["loss"] is not None and val["loss"] < best:
            best = val["loss"]
            model.save(args.output, tokenizer, args.max_len)
            print(f"  saved (best so far) in {args.output}/")

    if best == float("inf"):
        raise SystemExit("no epoch improved: nothing was saved")

    # Calibrate the best checkpoint on the validation split
    model, tokenizer, _ = SystemOne.load(args.output)
    model.to(device)
    groups, targets = collect(model, val_loader, device)
    before = metrics(groups, targets)
    temperature = fit_temperature(groups, targets)
    after = metrics(groups, targets, temperature)
    model.temperature.fill_(temperature)
    model.save(args.output, tokenizer, args.max_len)
    print(f"Calibration: temperature={temperature:.3f}\n  before: {before}\n  after:  {after}")
    print(f"Final model in {Path(args.output).resolve()}")


if __name__ == "__main__":
    main()
