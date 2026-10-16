import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Small white pill with a soft shadow (options, levels, question names). */
export function Chip({
  className,
  active = false,
  ...props
}: ComponentProps<"span"> & { active?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-sm bg-card px-2 py-0.5 font-mono text-code-sm break-all text-muted-foreground shadow-sm",
        active && "bg-brand-tint font-semibold text-primary",
        className,
      )}
      {...props}
    />
  );
}

export function ChipList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap gap-1.5", className)}>{children}</div>;
}
