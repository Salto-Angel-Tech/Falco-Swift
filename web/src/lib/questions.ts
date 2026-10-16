import type { Question, QuestionType } from "../api/types";

export function newQuestion(): Question {
  return { type: "noul", instructions: "" };
}

function itemsOf(question: Question): string[] {
  if (question.type === "choice") return question.options;
  if (question.type === "score") return question.levels;
  return [];
}

/** Switch a question's type, keeping instructions and reusing any option/level list. */
export function changeType(question: Question, type: QuestionType): Question {
  const items = itemsOf(question);
  const list = items.length ? [...items] : ["", ""];
  if (type === "choice") return { type, instructions: question.instructions, options: list };
  if (type === "score") return { type, instructions: question.instructions, levels: list };
  return { type: "noul", instructions: question.instructions };
}

/** Rename an object key, keeping insertion order (question order matters to users). */
export function renameKey<T>(record: Record<string, T>, from: string, to: string): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key === from ? to : key] = value;
  }
  return result;
}
