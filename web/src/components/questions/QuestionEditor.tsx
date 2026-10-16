import { CircleAlert, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import type { Question, QuestionType } from "@/api/types";
import { Field } from "@/components/common/Field";
import { StringListEditor } from "@/components/common/StringListEditor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { changeType } from "@/lib/questions";
import { validateName, validateQuestion } from "@/lib/validation";

const TYPE_HELP: Record<QuestionType, string> = {
  noul: "Yes/no statement: the model returns the probability that it holds.",
  choice: "Pick one of the options: the model returns a distribution over them.",
  score: "Ordered levels, lowest first: the model returns a 0-1 score and a distribution.",
};

interface QuestionEditorProps {
  name: string;
  question: Question;
  /** Names already used by other questions (renaming to one of them is rejected). */
  otherNames: string[];
  serverError?: string;
  types?: QuestionType[];
  onSave: (name: string, question: Question) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}

/**
 * Edits a local copy of one question (name, type, instructions, options/levels) with live
 * validation; `onSave` receives the result only when it is valid.
 */
export function QuestionEditor({
  name,
  question: initial,
  otherNames,
  serverError,
  types = ["noul", "choice", "score"],
  onSave,
  onCancel,
  onDelete,
}: QuestionEditorProps) {
  const [draftName, setDraftName] = useState(name);
  const [question, setQuestion] = useState<Question>(initial);
  const [nameError, setNameError] = useState<string | null>(null);
  const typeId = useId();

  const errors = validateQuestion(question);

  const save = () => {
    const trimmed = draftName.trim();
    const error = validateName(trimmed, otherNames);
    setNameError(error);
    if (error || errors.length) return;
    onSave(trimmed, question);
  };

  return (
    <form
      className="flex min-w-0 flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label="Name" error={nameError} hint="Key in questions.json and in the model output.">
        <Input
          value={draftName}
          autoComplete="off"
          className="font-mono"
          onChange={(e) => {
            setDraftName(e.target.value);
            setNameError(null);
          }}
        />
      </Field>

      <Field label="Type" hint={TYPE_HELP[question.type]} htmlFor={typeId}>
        <Select
          value={question.type}
          onValueChange={(type) => setQuestion(changeType(question, type as QuestionType))}
        >
          <SelectTrigger id={typeId} className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {types.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Instructions">
        <Textarea
          rows={3}
          value={question.instructions}
          onChange={(e) => setQuestion({ ...question, instructions: e.target.value })}
        />
      </Field>

      {question.type === "choice" && (
        <StringListEditor
          label="options"
          items={question.options}
          onChange={(options) => setQuestion({ ...question, options })}
        />
      )}
      {question.type === "score" && (
        <StringListEditor
          label="levels"
          ordered
          items={question.levels}
          onChange={(levels) => setQuestion({ ...question, levels })}
        />
      )}

      {(errors.length > 0 || serverError) && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>
            <ul aria-label="Validation errors" className="list-none">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
              {serverError && <li>Server: {serverError}</li>}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:items-center">
        {onDelete && (
          <Button
            type="button"
            variant="destructive"
            className="sm:mr-auto"
            onClick={onDelete}
          >
            <Trash2 />
            Delete
          </Button>
        )}
        <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={errors.length > 0}>
            Save question
          </Button>
        </div>
      </div>
    </form>
  );
}
