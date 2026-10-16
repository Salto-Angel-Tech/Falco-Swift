import { cn } from "@/lib/utils";

interface FalcoLockupProps {
  className?: string;
  /** Show the "Falco" wordmark next to the mark. */
  wordmark?: boolean;
  /** Small mono line after the wordmark, e.g. "by Salto Ángel". */
  suffix?: string;
}

/** The Falco mark (falcon icon) plus the wordmark. */
export function FalcoLockup({ className, wordmark = true, suffix }: FalcoLockupProps) {
  return (
    <span className={cn("inline-flex items-center gap-2 leading-none", className)}>
      <img
        src="/falco-icon.png"
        alt={wordmark ? "" : "Falco"}
        className="size-7 shrink-0 rounded-md"
        width={28}
        height={28}
      />
      {wordmark && (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-headline-sm font-semibold text-foreground">Falco</span>
          {suffix && <span className="font-mono text-code-sm text-text-3">{suffix}</span>}
        </span>
      )}
    </span>
  );
}
