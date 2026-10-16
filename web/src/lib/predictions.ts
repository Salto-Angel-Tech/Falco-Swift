import type { Prediction, QuestionsMap } from "@/api/types";
import { fixed, percent } from "./format";

/** One short line per prediction, for tables. */
export function predictionSummary(prediction: Prediction): string {
  if (prediction.type === "noul") return `yes ${percent(prediction.noul)}`;
  if (prediction.type === "choice") {
    return `${prediction.choice} (${percent(prediction.probability[prediction.choice])})`;
  }
  return `${fixed(prediction.score, 3)} (conf. ${percent(prediction.confidence)})`;
}

/** Distribution entries sorted by probability, highest first. */
export function rankDistribution(distribution: Record<string, number>): [string, number][] {
  return Object.entries(distribution).sort((a, b) => b[1] - a[1]);
}

/** The most likely entry of a distribution, or undefined when it is empty. */
export function peakEntry(distribution: Record<string, number>): [string, number] | undefined {
  return rankDistribution(distribution)[0];
}

/** Parse the playground's questions JSON; null unless it is a JSON object. */
export function parseQuestionsMap(text: string): QuestionsMap | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as QuestionsMap)
      : null;
  } catch {
    return null;
  }
}
