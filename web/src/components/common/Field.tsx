import { cloneElement, useId, type ReactElement, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  /**
   * Id of the labelled element when it is nested inside a composite control (e.g. the
   * trigger of a Select); the child is then rendered untouched.
   */
  htmlFor?: string;
  /** A single form control; it receives the generated `id` unless it already has one. */
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
}

/** Label + control + hint/error, wired together with ids for accessibility. */
export function Field({ label, hint, error, className, htmlFor, children }: FieldProps) {
  const generated = useId();
  const id = htmlFor ?? children.props.id ?? generated;
  const hintId = `${id}-hint`;
  const control = htmlFor
    ? children
    : cloneElement(children, {
        id,
        "aria-describedby": hint || error ? hintId : undefined,
        "aria-invalid": error ? true : undefined,
      });
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <Label htmlFor={id} className="text-[13px] font-medium text-muted-foreground">
        {label}
      </Label>
      {control}
      {(error || hint) && (
        <p id={hintId} className={cn("text-caption", error ? "text-destructive" : "text-text-3")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
