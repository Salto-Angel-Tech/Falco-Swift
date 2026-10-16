"""The falco command line: one entry point for every pipeline stage.

    falco <command> [args...]

The first argument picks the command; the rest is forwarded untouched to that
stage, so `falco tag --help` shows the labelling flags. Stage modules are
imported lazily, so `falco --help` does not load torch.
"""

import argparse
import importlib
import sys

STAGES = {
    "tag": ("falco.labelling.tag", "label states with the teacher LLM"),
    "train": ("falco.training.train", "train and calibrate the student model"),
    "evaluate": ("falco.evaluation.evaluate", "print the model's answers for hand-written cases"),
}
SERVERS = {
    "serve": ("falco.inference.api:app", "127.0.0.1", 8000, "serve the model over HTTP"),
    "studio": ("falco.studio.app:app", "127.0.0.1", 8001, "run the Falco Studio backend"),
}


def usage() -> str:
    lines = ["usage: falco <command> [args...]", "", "commands:"]
    for name, (_, help_text) in STAGES.items():
        lines.append(f"  {name:<10}{help_text}")
    for name, (_, _, _, help_text) in SERVERS.items():
        lines.append(f"  {name:<10}{help_text}")
    lines += ["", "Run `falco <command> --help` for the options of a command."]
    return "\n".join(lines)


def serve(name: str, argv: list[str]) -> None:
    """Run uvicorn on the app of a server command, forwarding --host, --port and --reload."""
    target, host, port, help_text = SERVERS[name]
    ap = argparse.ArgumentParser(prog=f"falco {name}", description=help_text)
    ap.add_argument("--host", default=host)
    ap.add_argument("--port", type=int, default=port)
    ap.add_argument("--reload", action="store_true", help="restart when the code changes")
    args = ap.parse_args(argv)

    import uvicorn

    uvicorn.run(target, host=args.host, port=args.port, reload=args.reload)


def main(argv: list[str] | None = None) -> None:
    argv = sys.argv[1:] if argv is None else argv
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(usage())
        return
    command, rest = argv[0], argv[1:]
    if command in STAGES:
        module = importlib.import_module(STAGES[command][0])
        sys.argv[0] = f"falco {command}"  # argparse derives the usage "prog" from argv[0]
        module.main(rest)
    elif command in SERVERS:
        serve(command, rest)
    else:
        print(f"falco: unknown command {command!r}\n", file=sys.stderr)
        print(usage(), file=sys.stderr)
        raise SystemExit(2)


if __name__ == "__main__":
    main()
