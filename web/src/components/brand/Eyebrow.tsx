import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Uppercase section label (11px, semibold, tracking .05em) used for captions and field groups. */
export function MonoLabel({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("m-0 label-caps text-text-3", className)} {...props} />;
}

/** Section eyebrow: the label in the primary color. */
export function Eyebrow({ className, ...props }: ComponentProps<"p">) {
  return <MonoLabel className={cn("text-primary", className)} {...props} />;
}
