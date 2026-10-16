import { cn } from "@/lib/utils";

/** 40px circle with an emerald tint and a mono number. */
export function StepNumber({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn(
        "relative z-[1] grid size-10 shrink-0 place-items-center rounded-full bg-brand-tint font-mono text-[13px] font-semibold text-primary",
        className,
      )}
    >
      {String(n).padStart(2, "0")}
    </span>
  );
}

/**
 * Gradient line joining consecutive steps: vertical on small screens, horizontal (to the
 * next column) from `lg` up. Place it inside a `relative` step.
 */
export function StepConnector({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute top-[48px] -bottom-8 left-[20px] w-px bg-gradient-to-b from-primary/40 to-surface-high",
        "lg:top-[20px] lg:right-[-28px] lg:bottom-auto lg:left-[52px] lg:h-px lg:w-auto lg:bg-gradient-to-r",
        className,
      )}
    />
  );
}
