"""Stand-in for the tag and train stages in the studio tests: no model, no network.

The behaviour is chosen with the value of --base (train) or --domain (tag):
"fail" exits with status 3, "sleep" blocks for a minute, anything else prints
train-like and tag-like progress lines and exits 0.
"""

import sys
import time


def flag(name: str) -> str | None:
    prefix = f"--{name}="
    for arg in sys.argv[1:]:
        if arg.startswith(prefix):
            return arg[len(prefix) :]
    return None


def main() -> int:
    mode = flag("base") or flag("domain") or "ok"
    print(f"argv {' '.join(sys.argv[1:])}")
    if mode == "sleep":
        print("sleeping", flush=True)
        time.sleep(60)
        return 0
    if mode == "fail":
        print("  failed: RuntimeError: boom")
        return 3
    print("Device: cpu | train: 9 | validation: 1")
    print("  epoch 1 step 50/100 loss 0.6931")
    print("Epoch 1: validation {'loss': 0.5, 'accuracy': 0.75, 'ece': 0.05, 'n': 4}")
    print("  saved (best so far) in model_test/")
    print("Calibration: temperature=1.250")
    print("  before: {'loss': 0.5, 'accuracy': 0.75, 'ece': 0.05, 'n': 4}")
    print("  after:  {'loss': 0.45, 'accuracy': 0.75, 'ece': 0.02, 'n': 4}")
    print("  generated 2/2")
    print("Done: 2 states labelled, 0 failed -> data.jsonl")
    print("Final model in model_test")
    return 0


if __name__ == "__main__":
    sys.exit(main())
