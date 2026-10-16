import type { Question, QuestionsMap } from "../api/types";

const TYPES = ["noul", "choice", "score"];
const MIN_ITEMS = 2;

function listErrors(items: unknown, label: string, typeLabel: string): string[] {
  const list = Array.isArray(items) ? items.map(String) : [];
  const errors: string[] = [];
  if (list.length < MIN_ITEMS) {
    errors.push(`A ${typeLabel} question needs at least ${MIN_ITEMS} ${label}.`);
  }
  const trimmed = list.map((item) => item.trim());
  const capitalized = label[0].toUpperCase() + label.slice(1);
  if (trimmed.some((item) => !item)) errors.push(`${capitalized} cannot be blank.`);
  if (new Set(trimmed.filter(Boolean)).size !== trimmed.filter(Boolean).length) {
    errors.push(`${capitalized} must be unique.`);
  }
  return errors;
}

/**
 * Client-side checks mirroring schema.validate_question (type, instructions, at least two
 * options/levels), plus blank and duplicate entries that would confuse the model.
 */
export function validateQuestion(question: Question): string[] {
  const errors: string[] = [];
  if (!TYPES.includes(question.type)) {
    errors.push(`"${String(question.type)}" is not a valid type.`);
    return errors;
  }
  if (!question.instructions || !question.instructions.trim()) {
    errors.push("Instructions are required.");
  }
  if (question.type === "choice") errors.push(...listErrors(question.options, "options", "choice"));
  if (question.type === "score") errors.push(...listErrors(question.levels, "levels", "score"));
  return errors;
}

export function validateName(name: string, existing: string[]): string | null {
  if (!name.trim()) return "A name is required.";
  if (existing.includes(name)) return `"${name}" already exists.`;
  return null;
}

/** Errors per question name; valid questions are omitted. */
export function validateQuestions(questions: QuestionsMap): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [name, question] of Object.entries(questions)) {
    const errors = validateQuestion(question);
    if (errors.length) result[name] = errors;
  }
  return result;
}
