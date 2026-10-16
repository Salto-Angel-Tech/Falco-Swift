import type { EvaluateEntry } from "@/api/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { predictionSummary } from "@/lib/predictions";

/** Presentational: case × question matrix of an evaluation run. */
export function ResultsTable({ results }: { results: EvaluateEntry[] }) {
  const questionNames = Array.from(
    new Set(results.flatMap((entry) => Object.keys(entry.result ?? {}))),
  );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Case</TableHead>
          <TableHead>Id</TableHead>
          {questionNames.map((name) => (
            <TableHead key={name} className="font-mono">
              {name}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((entry) => (
          <TableRow key={entry.file}>
            <TableCell className="font-mono text-foreground">{entry.file}</TableCell>
            <TableCell className="text-muted-foreground">{entry.id ?? ""}</TableCell>
            {entry.error ? (
              <TableCell
                colSpan={Math.max(1, questionNames.length)}
                className="whitespace-normal text-destructive"
              >
                {entry.error}
              </TableCell>
            ) : (
              questionNames.map((name) => (
                <TableCell key={name} className="text-muted-foreground">
                  {entry.result?.[name] ? (
                    <span className="text-foreground">{predictionSummary(entry.result[name])}</span>
                  ) : (
                    "–"
                  )}
                </TableCell>
              ))
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
