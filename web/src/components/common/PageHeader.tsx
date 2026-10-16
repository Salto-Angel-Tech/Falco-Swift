import type { ReactNode } from "react";

interface PageHeaderProps {
  /** Short context shown as an emerald mono badge next to the title (e.g. "Step 03 · Serve"). */
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  /** Right-aligned controls or status pills. */
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-headline-md">{title}</h1>
          {eyebrow && (
            <span className="rounded-sm bg-brand-tint px-2 py-0.5 font-mono text-code-sm font-semibold text-primary">
              {eyebrow}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-1 max-w-[72ch] text-body text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
