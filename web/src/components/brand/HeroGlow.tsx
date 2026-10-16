import { cn } from "@/lib/utils";

/** Soft accent blur circle behind a hero (opacity .12, blur 110px). */
export function HeroGlow({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute -top-10 -right-32 size-[420px] rounded-full bg-brand-bright opacity-[0.06] blur-[110px] md:size-[560px]",
        className,
      )}
    />
  );
}
