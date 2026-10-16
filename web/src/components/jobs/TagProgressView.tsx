import { CircleCheck } from "lucide-react";
import { MonoLabel } from "@/components/brand/Eyebrow";
import { LabeledProgress } from "@/components/common/LabeledProgress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { TagIssueKind, TagState } from "@/lib/jobProgress";
import { tagProgress } from "@/lib/jobProgress";

const ISSUE_VARIANTS: Record<TagIssueKind, "danger" | "warning"> = {
  failed: "danger",
  gave_up: "danger",
  discarded: "warning",
  warning: "warning",
};

/** Presentational: progress bars, result and failures list of a tag job. */
export function TagProgressView({ state }: { state: TagState }) {
  const progress = tagProgress(state);
  const failures = state.issues.filter((i) => i.kind === "failed").length;
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {state.generated && state.labelling && (
        <LabeledProgress
          label="Generated states"
          value={state.generated.n}
          max={state.generated.total}
        />
      )}
      {progress ? (
        <LabeledProgress {...progress} />
      ) : (
        <p className="text-body text-text-3">Waiting for progress...</p>
      )}
      {state.labelling && state.already > 0 && (
        <p className="text-body text-muted-foreground">
          {state.already} states were already labelled in <code>{state.output}</code> and are
          skipped.
        </p>
      )}
      {state.done && (
        <Alert variant="success">
          <CircleCheck />
          <AlertDescription>
            <span>
              Done: <strong>{state.done.ok}</strong> states labelled,{" "}
              <strong>{state.done.failed}</strong> failed, written to{" "}
              <code>{state.done.output}</code>
            </span>
          </AlertDescription>
        </Alert>
      )}
      {state.issues.length > 0 && (
        <section className="flex flex-col gap-3">
          <MonoLabel>
            Failures and warnings · {failures} failed, {state.issues.length - failures} other
          </MonoLabel>
          <ul className="flex max-h-[280px] flex-col gap-2 overflow-y-auto pr-1">
            {state.issues.map((issue, index) => (
              <li
                key={index}
                className="flex flex-col items-start gap-2 rounded-md bg-surface-low px-3 py-2 text-body sm:flex-row sm:items-center"
              >
                <Badge variant={ISSUE_VARIANTS[issue.kind]}>{issue.kind.replace("_", " ")}</Badge>
                <span className="min-w-0 break-words text-muted-foreground">{issue.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
