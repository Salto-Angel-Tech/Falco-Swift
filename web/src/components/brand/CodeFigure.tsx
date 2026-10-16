import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MonoLabel } from "./Eyebrow";

interface CodeFigureProps {
  caption: ReactNode;
  /** Right side of the caption bar (counts, actions). */
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  preClassName?: string;
  /** Accessible name for the scrollable block. */
  label?: string;
}

/** Code/log block: dark figure with a caption bar and a mono `pre`. */
export const CodeFigure = forwardRef<HTMLPreElement, CodeFigureProps>(function CodeFigure(
  { caption, meta, children, className, preClassName, label },
  ref,
) {
  return (
    <figure
      className={cn("m-0 min-w-0 overflow-hidden rounded-xl bg-code text-code-foreground", className)}
    >
      <figcaption className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <MonoLabel className="text-code-foreground/60">{caption}</MonoLabel>
        {meta && <span className="font-mono text-code-sm text-code-foreground/60">{meta}</span>}
      </figcaption>
      <pre
        ref={ref}
        tabIndex={0}
        aria-label={label}
        className={cn(
          "m-0 overflow-auto p-4 font-mono text-code-base whitespace-pre text-code-foreground [tab-size:2] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-bright",
          preClassName,
        )}
      >
        {children}
      </pre>
    </figure>
  );
});
