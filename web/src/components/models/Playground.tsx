import {
  Check,
  CircleAlert,
  Copy,
  Eraser,
  FileInput,
  ListChecks,
  Play,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import type { Question, QuestionsMap } from "@/api/types";
import { CodeFigure } from "@/components/brand/CodeFigure";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { SectionCard } from "@/components/common/SectionCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useActiveModel, useCases, useDecide, useQuestions } from "@/hooks/queries";
import { fixed, parseStateInput, stateToInput } from "@/lib/format";
import { parseQuestionsMap } from "@/lib/predictions";
import { cn } from "@/lib/utils";
import { PredictionView } from "./PredictionView";

const CASES_DIR = "cases";

const TYPE_LABEL: Record<Question["type"], string> = {
  noul: "Yes / No",
  choice: "Multiple choice",
  score: "Score",
};

const TYPE_PILL: Record<Question["type"], string> = {
  noul: "bg-brand-tint text-primary",
  choice: "bg-secondary-container text-on-secondary-container",
  score: "bg-tertiary-fixed text-on-tertiary-fixed",
};

const PILL = "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-mono text-code-sm font-semibold";

/** Presentational: one configured question with its type and options/levels. */
function QuestionRow({ name, question }: { name: string; question: Question }) {
  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-md bg-surface-low p-3 transition-colors hover:bg-surface-container">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 font-mono text-code-base font-semibold break-all text-foreground">{name}</span>
        {question?.type in TYPE_LABEL && (
          <span className={cn(PILL, TYPE_PILL[question.type])}>{TYPE_LABEL[question.type]}</span>
        )}
      </div>
      {question?.instructions && (
        <p className="text-body break-words text-muted-foreground">{question.instructions}</p>
      )}
      {question?.type === "choice" && Array.isArray(question.options) && question.options.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {question.options.map((option, index) => (
            <span key={index} className="rounded-sm bg-card px-2 py-0.5 font-mono text-code-sm text-muted-foreground shadow-sm">
              {option}
            </span>
          ))}
        </div>
      )}
      {question?.type === "score" && Array.isArray(question.levels) && question.levels.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {question.levels.map((level, index) => (
            <span key={index} className="flex items-center gap-1.5">
              {index > 0 && <span aria-hidden="true" className="text-code-sm text-text-3">→</span>}
              <span className="rounded-sm bg-card px-2 py-0.5 font-mono text-code-sm text-muted-foreground shadow-sm">
                {level}
              </span>
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

/**
 * Container: the playground console. Input and configured questions on the left; the
 * /decide response (visual or raw JSON) on the right.
 */
export function Playground() {
  const questionsFile = useQuestions("questions.json");
  const active = useActiveModel();
  const cases = useCases(CASES_DIR);
  const decide = useDecide();
  const [state, setState] = useState("");
  const [questionsText, setQuestionsText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [view, setView] = useState("visual");
  const [latency, setLatency] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | undefined>(undefined);
  const questions = useMemo(() => parseQuestionsMap(questionsText), [questionsText]);
  const questionEntries = questions ? Object.entries(questions) : [];
  const model = active.data?.active;
  const canRun = !decide.isPending && !!state.trim();

  useEffect(() => {
    if (questionsFile.data) {
      setQuestionsText((current) =>
        current ? current : JSON.stringify(questionsFile.data.questions, null, 2),
      );
    }
  }, [questionsFile.data]);

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const run = () => {
    if (!canRun) return;
    let parsed: QuestionsMap;
    try {
      parsed = JSON.parse(questionsText) as QuestionsMap;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("questions must be a JSON object");
      }
    } catch (error) {
      setParseError(`Invalid questions JSON: ${(error as Error).message}`);
      return;
    }
    setParseError(null);
    const started = performance.now();
    decide.mutate(
      { state: parseStateInput(state), questions: parsed },
      {
        onSuccess: () => setLatency(performance.now() - started),
        onError: (error) => {
          setLatency(null);
          toast.error("Decide failed", { description: errorMessage(error) });
        },
      },
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      run();
    }
  };

  const copyJson = async () => {
    if (!decide.data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(decide.data, null, 2));
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      toast.error("Could not copy", { description: errorMessage(error) });
    }
  };

  const loadCase = (name: string) => {
    const found = cases.data?.find((item) => item.name === name);
    if (found) setState(stateToInput(found.state));
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="playground-title">
      <div>
        <h2 id="playground-title" className="text-headline-md">
          Playground
        </h2>
        <p className="mt-1 text-body text-muted-foreground">
          Send a state to the loaded model and read its calibrated answer.
        </p>
      </div>
      {!model && active.isSuccess && (
        <Alert variant="info">
          <CircleAlert />
          <AlertDescription>Load a model above before running the playground.</AlertDescription>
        </Alert>
      )}
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-6">
          <SectionCard
            title={<Label htmlFor="playground-state" className="text-headline-sm font-semibold">Input</Label>}
            icon={FileInput}
            contentClassName="gap-3"
            footerClassName="justify-between"
            footer={
              <>
                <Button onClick={run} disabled={!canRun}>
                  <Play />
                  {decide.isPending ? "Running..." : "Run prediction"}
                  <kbd className="ml-1 hidden rounded-sm bg-white/15 px-1.5 py-px font-mono text-[10px] font-medium sm:inline">
                    Ctrl+Enter
                  </kbd>
                </Button>
                <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
                  <ShieldCheck aria-hidden="true" className="size-4 text-success" />
                  Local classifier • zero external calls
                </span>
              </>
            }
          >
            <div className="rounded-md bg-surface-low p-2">
              <Textarea
                id="playground-state"
                rows={7}
                value={state}
                onChange={(e) => setState(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="I was charged twice this month and nobody answers my emails."
                className="min-h-36 resize-none border-0 bg-transparent p-1 font-mono text-code-base shadow-none focus-visible:ring-0 md:text-code-base"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-code-sm text-text-3">{state.length} chars</span>
              <div className="flex flex-wrap items-center gap-2">
                {cases.data && cases.data.length > 0 && (
                  <Select value="" onValueChange={loadCase}>
                    <SelectTrigger size="sm" aria-label="Load a saved case" className="h-7 text-caption">
                      <SelectValue placeholder="Load case" />
                    </SelectTrigger>
                    <SelectContent>
                      {cases.data.map((item) => (
                        <SelectItem key={item.name} value={item.name}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!state}
                  onClick={() => setState("")}
                  className="hover:bg-error-surface hover:text-error-text"
                >
                  <Eraser />
                  Clear
                </Button>
              </div>
            </div>
            <p className="text-caption text-text-3">Plain text, or JSON (an object or array is sent as JSON).</p>
            {parseError && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}
            <ErrorAlert error={decide.error} />
          </SectionCard>

          <SectionCard
            title="Configured questions"
            icon={ListChecks}
            actions={
              <span className="rounded-sm bg-card px-2 py-0.5 font-mono text-code-sm font-semibold text-muted-foreground shadow-sm">
                {questionEntries.length}
              </span>
            }
            contentClassName="gap-3"
          >
            {questionEntries.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {questionEntries.map(([name, question]) => (
                  <QuestionRow key={name} name={name} question={question} />
                ))}
              </ul>
            ) : (
              <p className="text-body text-text-3">No questions parsed yet.</p>
            )}
            <details className="group">
              <summary className="cursor-pointer text-body font-medium text-primary select-none">
                Edit questions JSON
              </summary>
              <Textarea
                aria-label="Questions (JSON)"
                rows={10}
                value={questionsText}
                onChange={(e) => setQuestionsText(e.target.value)}
                className="mt-3 border-0 bg-surface-low font-mono text-code-base shadow-none md:text-code-base"
              />
              <p className="mt-2 text-caption text-text-3">Prefilled from questions.json.</p>
            </details>
          </SectionCard>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-6">
          <Tabs value={view} onValueChange={setView} className="gap-0">
            <SectionCard
              title="Prediction results"
              icon={Sparkles}
              actions={
                <TabsList aria-label="Result view">
                  <TabsTrigger value="visual">Visual</TabsTrigger>
                  <TabsTrigger value="json">JSON</TabsTrigger>
                </TabsList>
              }
              contentClassName="gap-0 p-0"
              footer={
                view === "json" && decide.data ? (
                  <Button variant="secondary" size="sm" onClick={copyJson}>
                    {copied ? <Check /> : <Copy />}
                    {copied ? "Copied!" : "Copy JSON"}
                  </Button>
                ) : undefined
              }
            >
              {decide.data && (
                <div className="flex flex-wrap items-center gap-2 bg-surface-low px-4 py-2" aria-label="Telemetry">
                  {latency !== null && (
                    <span className={cn(PILL, "bg-card text-muted-foreground shadow-sm")}>
                      Latency <span className="text-foreground">{Math.round(latency)} ms</span>
                    </span>
                  )}
                  <span className={cn(PILL, "bg-card text-muted-foreground shadow-sm")}>
                    Targets <span className="text-foreground">{Object.keys(decide.data).length}</span>
                  </span>
                  {model && (
                    <span className={cn(PILL, "bg-card text-muted-foreground shadow-sm")}>
                      Device <span className="text-foreground">{model.device}</span>
                    </span>
                  )}
                </div>
              )}
              <div className="p-4">
                {decide.data ? (
                  <>
                    <TabsContent value="visual">
                      <PredictionView decision={decide.data} />
                    </TabsContent>
                    <TabsContent value="json">
                      <CodeFigure caption="Response · POST /api/decide" preClassName="max-h-[520px]" label="Decide response JSON">
                        {JSON.stringify(decide.data, null, 2)}
                      </CodeFigure>
                    </TabsContent>
                  </>
                ) : (
                  <div className="grid min-h-48 place-items-center rounded-md bg-surface-low px-6 text-center text-body text-text-3">
                    {decide.isPending ? "Running prediction..." : "Run a prediction to see the model's answer here."}
                  </div>
                )}
              </div>
            </SectionCard>
          </Tabs>

          {model && (
            <p className="rounded-xl bg-surface-container px-4 py-3 font-mono text-code-sm text-muted-foreground">
              Calibrated with temperature T={fixed(model.temperature, 3)} · {model.device} · max length{" "}
              {model.max_len}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
