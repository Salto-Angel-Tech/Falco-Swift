import { CircleAlert, Info, Plus, Save, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/api/client";
import type { Question, QuestionsMap } from "@/api/types";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { Field } from "@/components/common/Field";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { QuestionCard } from "@/components/questions/QuestionCard";
import { QuestionEditor } from "@/components/questions/QuestionEditor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useMeta, useQuestions, useSaveQuestions } from "@/hooks/queries";
import { newQuestion, renameKey } from "@/lib/questions";
import { validateQuestions } from "@/lib/validation";

function freshName(existing: string[]): string {
  let i = existing.length + 1;
  while (existing.includes(`question_${i}`)) i += 1;
  return `question_${i}`;
}

/** The question being edited in the dialog; `isNew` ones are inserted on save. */
interface Editing {
  name: string;
  question: Question;
  isNew: boolean;
}

export function QuestionsPage() {
  const [pathInput, setPathInput] = useState("questions.json");
  const [path, setPath] = useState("questions.json");
  const meta = useMeta();
  const query = useQuestions(path);
  const save = useSaveQuestions(path);
  const [draft, setDraft] = useState<QuestionsMap>({});
  const [dirty, setDirty] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);

  const missing = query.error instanceof ApiError && query.error.status === 404;

  useEffect(() => {
    if (query.data) {
      setDraft(query.data.questions);
      setDirty(false);
    } else if (missing) {
      setDraft({});
      setDirty(false);
    }
  }, [query.data, missing]);

  const names = Object.keys(draft);
  const clientErrors = validateQuestions(draft);
  const invalidCount = Object.keys(clientErrors).length;

  const update = (next: QuestionsMap) => {
    setDraft(next);
    setDirty(true);
    setSaved(false);
  };

  const add = () =>
    setEditing({ name: freshName(names), question: newQuestion(), isNew: true });

  const applyEdit = (name: string, question: Question) => {
    if (!editing) return;
    let next: QuestionsMap;
    if (editing.isNew) {
      next = { ...draft, [name]: question };
    } else {
      next = name === editing.name ? { ...draft } : renameKey(draft, editing.name, name);
      next[name] = question;
    }
    setServerErrors(({ [editing.name]: _old, ...rest }) => rest);
    update(next);
    setEditing(null);
  };

  const remove = (name: string) => {
    if (!window.confirm(`Delete question "${name}"?`)) return;
    const next = { ...draft };
    delete next[name];
    update(next);
    setEditing(null);
  };

  const onSave = () => {
    setServerErrors({});
    save.mutate(draft, {
      onSuccess: () => {
        setDirty(false);
        setSaved(true);
        toast.success(`Saved ${path}`);
      },
      onError: (error) => {
        if (error instanceof ApiError && error.fieldErrors) {
          setServerErrors(error.fieldErrors);
          toast.error("The server rejected some questions");
        } else {
          toast.error("Could not save the questions", { description: errorMessage(error) });
        }
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Define"
        title="Questions"
        description="What the model answers about each state: yes/no statements, one-of choices or ordered scores."
        actions={
          <>
            {dirty && <Badge variant="warning">unsaved changes</Badge>}
            {saved && !dirty && <Badge variant="success">saved</Badge>}
            <Button onClick={onSave} disabled={save.isPending || invalidCount > 0 || !dirty}>
              <Save />
              {save.isPending ? "Saving..." : "Save file"}
            </Button>
          </>
        }
      />

      <SectionCard>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty && !window.confirm("Discard unsaved changes?")) return;
            setPath(pathInput.trim() || "questions.json");
          }}
        >
          <Field label="Questions file" hint="A .json file inside the studio root." className="flex-1">
            <Input value={pathInput} onChange={(e) => setPathInput(e.target.value)} />
          </Field>
          <Button type="submit" variant="outline" className="sm:mb-6">
            Load
          </Button>
        </form>
        {missing && (
          <Alert variant="info">
            <Info />
            <AlertDescription>
              {path} does not exist yet. Add questions and save to create it.
            </AlertDescription>
          </Alert>
        )}
        {!missing && <ErrorAlert error={query.error} />}
        {invalidCount > 0 && (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertDescription>
              {invalidCount} question{invalidCount > 1 ? "s have" : " has"} errors. Fix them before
              saving.
            </AlertDescription>
          </Alert>
        )}
        {Object.keys(serverErrors).length > 0 && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>The server rejected some questions; see the marked ones.</AlertDescription>
          </Alert>
        )}
      </SectionCard>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl">
            {names.length} question{names.length === 1 ? "" : "s"}
          </h2>
          <Button variant="outline" onClick={add}>
            <Plus />
            Add question
          </Button>
        </div>
        {query.isLoading && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-44 rounded-lg" />
            <Skeleton className="h-44 rounded-lg" />
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {names.map((name) => (
            <QuestionCard
              key={name}
              name={name}
              question={draft[name]}
              clientErrors={clientErrors[name]}
              serverError={serverErrors[name]}
              onEdit={() => setEditing({ name, question: draft[name], isNew: false })}
            />
          ))}
        </div>
        {!names.length && !query.isLoading && (
          <button
            type="button"
            onClick={add}
            className="grid min-h-40 place-items-center rounded-xl border border-dashed text-body text-text-3 transition-colors hover:bg-surface-container hover:text-foreground"
          >
            No questions yet. Add the first one.
          </button>
        )}
      </section>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-headline-sm">
              {editing?.isNew ? "New question" : "Edit question"}
            </DialogTitle>
            <DialogDescription>
              Changes apply to the list; use Save file to write {path}.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <QuestionEditor
              key={`${editing.name}-${editing.isNew}`}
              name={editing.name}
              question={editing.question}
              otherNames={names.filter((n) => editing.isNew || n !== editing.name)}
              serverError={editing.isNew ? undefined : serverErrors[editing.name]}
              types={meta.data?.question_types}
              onSave={applyEdit}
              onCancel={() => setEditing(null)}
              onDelete={editing.isNew ? undefined : () => remove(editing.name)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
