import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { Field } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePutCase } from "@/hooks/queries";
import { parseStateInput } from "@/lib/format";

const CASE_NAME = /^[A-Za-z0-9_-]+$/;

export interface CaseDraft {
  name: string;
  id: string;
  state: string;
  isNew: boolean;
}

export const EMPTY_CASE: CaseDraft = { name: "", id: "", state: "", isNew: true };

/** Container: form that writes one case file (PUT /api/cases/{name}). */
export function CaseEditor({
  dir,
  draft,
  onDone,
}: {
  dir: string;
  draft: CaseDraft;
  onDone: () => void;
}) {
  const [value, setValue] = useState(draft);
  const put = usePutCase(dir);
  const nameError = value.name && !CASE_NAME.test(value.name) ? "Use only A-Z a-z 0-9 _ -" : null;

  const save = () =>
    put.mutate(
      { name: value.name, id: value.id.trim() || null, state: parseStateInput(value.state) },
      {
        onSuccess: () => {
          toast.success(`Saved case ${value.name}`);
          onDone();
        },
        onError: (error) => toast.error("Could not save the case", { description: errorMessage(error) }),
      },
    );

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={nameError} hint="File name without .json">
          <Input
            value={value.name}
            disabled={!value.isNew}
            className="font-mono"
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
        </Field>
        <Field label="Id" hint="Optional identifier.">
          <Input value={value.id} onChange={(e) => setValue({ ...value, id: e.target.value })} />
        </Field>
      </div>
      <Field label="State" hint="Plain text or JSON.">
        <Textarea
          rows={7}
          value={value.state}
          className="font-mono text-[13px]"
          onChange={(e) => setValue({ ...value, state: e.target.value })}
        />
      </Field>
      <ErrorAlert error={put.error} />
      <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!value.name || !!nameError || !value.state.trim() || put.isPending}
        >
          {put.isPending ? "Saving..." : "Save case"}
        </Button>
      </div>
    </form>
  );
}
