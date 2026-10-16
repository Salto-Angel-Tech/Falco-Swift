import { ArrowRight, ListChecks } from "lucide-react";
import { Link } from "react-router-dom";
import { Eyebrow } from "@/components/brand/Eyebrow";
import { HeroGlow } from "@/components/brand/HeroGlow";
import { LabelStatus, ServeStatus, TrainStatus } from "@/components/overview/StepStatuses";
import { StepCard } from "@/components/overview/StepCard";
import { Button } from "@/components/ui/button";

export function OverviewPage() {
  return (
    <div className="flex flex-col gap-14">
      <section className="relative -mx-4 overflow-x-clip px-4 pt-6 pb-2 md:-mx-8 md:px-8 md:pt-12">
        <HeroGlow />
        <div className="relative max-w-[720px]">
          <Eyebrow>Falco Studio</Eyebrow>
          <h1 className="mt-4 text-[clamp(28px,3.4vw,40px)] leading-[1.15]">Label, train, serve</h1>
          <p className="mt-5 max-w-[620px] text-[15px] leading-[1.6] text-muted-foreground">
            Distill an LLM into a small, fast, calibrated classifier. A teacher labels your states,
            a multilingual encoder learns them, and the model answers in milliseconds.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link to="/label">
                Start labelling
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/questions">
                <ListChecks />
                Edit questions
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="pipeline-title">
        <Eyebrow>Pipeline</Eyebrow>
        <h2 id="pipeline-title" className="mt-2 text-headline-md">
          Three steps, live
        </h2>
        <ol className="mt-10 grid list-none grid-cols-1 gap-9 p-0 lg:grid-cols-3 lg:gap-10">
          <StepCard
            n={1}
            title="Label"
            file="data.jsonl"
            description="A teacher LLM answers your questions for each state."
            to="/label"
            cta="Open labelling"
          >
            <LabelStatus />
          </StepCard>
          <StepCard
            n={2}
            title="Train"
            file="model/"
            description="A multilingual encoder learns the labels and gets calibrated."
            to="/train"
            cta="Open training"
          >
            <TrainStatus />
          </StepCard>
          <StepCard
            n={3}
            title="Serve"
            file="POST /decide"
            description="Load the model and get calibrated answers in milliseconds."
            to="/models"
            cta="Open playground"
            last
          >
            <ServeStatus />
          </StepCard>
        </ol>
      </section>
    </div>
  );
}
