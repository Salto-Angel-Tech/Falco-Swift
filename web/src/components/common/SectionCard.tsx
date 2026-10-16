import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Optional 18px icon shown before the title in the header strip. */
  icon?: LucideIcon;
  actions?: ReactNode;
  /** Optional footer strip (buttons, captions). */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  footerClassName?: string;
}

/** A console panel: tinted header strip, padded body and optional footer strip. */
export function SectionCard({
  title,
  description,
  icon: Icon,
  actions,
  footer,
  children,
  className,
  contentClassName,
  footerClassName,
}: SectionCardProps) {
  return (
    <Card className={cn("min-w-0 gap-0 py-0", className)}>
      {(title || actions) && (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-surface-container px-4 py-3">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {Icon && <Icon aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-muted-foreground" />}
            <div className="min-w-0">
              {title && <CardTitle className="min-w-0 break-words">{title}</CardTitle>}
              {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
        </div>
      )}
      <CardContent className={cn("flex min-w-0 flex-col gap-4 p-4", contentClassName)}>
        {children}
      </CardContent>
      {footer && (
        <div
          className={cn(
            "flex min-w-0 flex-wrap items-center gap-3 bg-surface-low px-4 py-3",
            footerClassName,
          )}
        >
          {footer}
        </div>
      )}
    </Card>
  );
}
