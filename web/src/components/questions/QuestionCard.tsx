import { CircleAlert, Pencil } from "lucide-react";
import type { Question } from "@/api/types";
import { Chip, ChipList } from "@/components/brand/Chip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QuestionCardProps {
  name: string;
  question: Question;
  clientErrors?: string[];
  serverError?: string;
  onEdit: () => void;
}

function itemsOf(question: Question): string[] {
  if (question.type === "choice") return question.options;
  if (question.type === "score") return question.levels;
  return [];
}

/** Presentational: one question with its type, instructions, options as chips and errors. */
export function QuestionCard({ name, question, clientErrors = [], serverError, onEdit }: QuestionCardProps) {
  const items = itemsOf(question);
  return (
    <Card className="min-w-0 gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 font-mono text-base font-medium tracking-normal break-all">
            {name}
          </span>
          <Badge variant={question.type === "noul" ? "info" : question.type === "choice" ? "success" : "warning"}>
            {question.type}
          </Badge>
        </CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" onClick={onEdit} aria-label={`Edit ${name}`}>
            <Pencil />
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-5">
        <p className="text-body break-words text-muted-foreground">
          {question.instructions || <span className="text-text-3 italic">No instructions yet.</span>}
        </p>
        {items.length > 0 && (
          <ChipList>
            {items.map((item, index) => (
              <Chip key={index}>
                {question.type === "score" && (
                  <span className="font-mono text-caption text-text-3">{index}</span>
                )}
                {item || <span className="italic text-text-3">blank</span>}
              </Chip>
            ))}
          </ChipList>
        )}
        {(clientErrors.length > 0 || serverError) && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>
              <ul className="list-none">
                {clientErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
                {serverError && <li>Server: {serverError}</li>}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
