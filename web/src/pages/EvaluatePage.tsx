import { FlaskConical, Info, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import type { Case } from "@/api/types";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { Field } from "@/components/common/Field";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { CaseEditor, EMPTY_CASE, type CaseDraft } from "@/components/evaluate/CaseEditor";
import { ResultsTable } from "@/components/evaluate/ResultsTable";
import { TrainRunningWarning } from "@/components/jobs/TrainRunningWarning";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCases, useDeleteCase, useEvaluate } from "@/hooks/queries";
import { stateToInput } from "@/lib/format";

function preview(state: unknown): string {
  const text = stateToInput(state).replace(/\s+/g, " ");
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

export function EvaluatePage() {
  const [dirInput, setDirInput] = useState("cases");
  const [dir, setDir] = useState("cases");
  const [questionsPath, setQuestionsPath] = useState("questions.json");
  const cases = useCases(dir);
  const remove = useDeleteCase(dir);
  const evaluate = useEvaluate();
  const [draft, setDraft] = useState<CaseDraft | null>(null);

  const edit = (item: Case) =>
    setDraft({ name: item.name, id: item.id ?? "", state: stateToInput(item.state), isNew: false });

  const onDelete = (name: string) => {
    if (!window.confirm(`Delete case "${name}"?`)) return;
    remove.mutate(name, {
      onSuccess: () => toast.success(`Deleted case ${name}`),
      onError: (error) => toast.error("Could not delete the case", { description: errorMessage(error) }),
    });
  };

  const onEvaluate = () =>
    evaluate.mutate(
      { dir, questionsPath },
      { onError: (error) => toast.error("Evaluation failed", { description: errorMessage(error) }) },
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Check"
        title="Evaluate"
        description="Keep a folder of reference cases and run the loaded model over all of them."
      />
      <TrainRunningWarning />

      <SectionCard
        title="Cases"
        actions={
          <Button variant="outline" size="sm" onClick={() => setDraft(EMPTY_CASE)}>
            <Plus />
            New case
          </Button>
        }
      >
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setDir(dirInput.trim() || "cases");
          }}
        >
          <Field label="Cases folder" className="flex-1">
            <Input value={dirInput} onChange={(e) => setDirInput(e.target.value)} />
          </Field>
          <Button type="submit" variant="outline">
            Open
          </Button>
        </form>
        <ErrorAlert error={cases.error ?? remove.error} />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Id</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.data?.map((item) => (
              <TableRow key={item.name}>
                <TableCell className="font-mono text-foreground">{item.name}</TableCell>
                <TableCell className="text-muted-foreground">{item.id ?? ""}</TableCell>
                <TableCell className="max-w-[28rem] truncate text-muted-foreground">
                  {item.error ? <span className="text-destructive">{item.error}</span> : preview(item.state)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${item.name}`}
                      onClick={() => edit(item)}
                      disabled={!!item.error}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${item.name}`}
                      onClick={() => onDelete(item.name)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {cases.data?.length === 0 && <p className="text-body text-text-3">No cases in {dir}.</p>}
      </SectionCard>

      <SectionCard
        title="Run evaluation"
        actions={
          <Button onClick={onEvaluate} disabled={evaluate.isPending}>
            <FlaskConical />
            {evaluate.isPending ? "Evaluating..." : "Evaluate"}
          </Button>
        }
      >
        <Field label="Questions file" className="sm:max-w-sm">
          <Input value={questionsPath} onChange={(e) => setQuestionsPath(e.target.value)} />
        </Field>
        <ErrorAlert error={evaluate.error} />
        {evaluate.data && evaluate.data.length === 0 && (
          <Alert variant="info">
            <Info />
            <AlertDescription>No cases to evaluate in {dir}.</AlertDescription>
          </Alert>
        )}
        {evaluate.data && evaluate.data.length > 0 && <ResultsTable results={evaluate.data} />}
      </SectionCard>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-headline-sm">
              {draft?.isNew ? "New case" : `Edit ${draft?.name ?? "case"}`}
            </DialogTitle>
            <DialogDescription>Stored as {dir}/&lt;name&gt;.json.</DialogDescription>
          </DialogHeader>
          {draft && (
            <CaseEditor
              key={`${draft.name}-${draft.isNew}`}
              dir={dir}
              draft={draft}
              onDone={() => setDraft(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
