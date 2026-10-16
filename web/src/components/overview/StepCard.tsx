import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { StepConnector, StepNumber } from "@/components/brand/StepNumber";

interface StepCardProps {
  n: number;
  title: string;
  file: string;
  description: string;
  to: string;
  cta: string;
  /** Live status block (stats, badges). */
  children: ReactNode;
  last?: boolean;
}

/** One pipeline step: number + connector, title, file tag, live status and a link. */
export function StepCard({ n, title, file, description, to, cta, children, last = false }: StepCardProps) {
  return (
    <li className="relative min-w-0 pl-[60px] lg:pl-0">
      <StepNumber n={n} className="absolute top-0 left-0 lg:static" />
      {!last && <StepConnector />}
      <h3 className="mt-2 text-headline-sm lg:mt-4">{title}</h3>
      <span className="mt-2.5 inline-block rounded-sm bg-brand-tint px-2 py-0.5 font-mono text-code-sm font-semibold text-primary">
        {file}
      </span>
      <p className="mt-2 max-w-[44ch] text-body text-muted-foreground">
        {description}
      </p>
      <div className="mt-4 rounded-xl bg-card p-4 shadow-card">
        {children}
        <Link
          to={to}
          className="group mt-4 inline-flex items-center gap-2 border-b border-transparent text-body font-semibold text-primary transition-colors hover:border-current focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          {cta}
          <ArrowRight className="size-4 transition-transform duration-300 ease-brand group-hover:translate-x-0.5" />
        </Link>
      </div>
    </li>
  );
}
