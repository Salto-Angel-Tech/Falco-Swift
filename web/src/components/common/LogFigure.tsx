import { useEffect, useRef } from "react";
import { CodeFigure } from "@/components/brand/CodeFigure";

const MAX_RENDERED = 2000;

/** Live log in a code figure; renders the last MAX_RENDERED lines and follows the tail. */
export function LogFigure({ lines, caption = "Log" }: { lines: string[]; caption?: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const shown = lines.length > MAX_RENDERED ? lines.slice(-MAX_RENDERED) : lines;

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <CodeFigure
      ref={ref}
      caption={caption}
      label={`${caption} output`}
      meta={
        lines.length > MAX_RENDERED
          ? `last ${MAX_RENDERED} of ${lines.length} lines`
          : `${lines.length} lines`
      }
      preClassName="max-h-[360px]"
    >
      {shown.join("\n") || <span className="text-code-foreground/50">No output yet.</span>}
    </CodeFigure>
  );
}
