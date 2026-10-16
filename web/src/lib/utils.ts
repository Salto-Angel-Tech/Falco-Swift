import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Custom theme tokens from index.css; without them tailwind-merge reads `text-body` as a
// color and drops it next to `text-muted-foreground`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "body",
        "caption",
        "label-caps",
        "headline-sm",
        "headline-md",
        "stat-lg",
        "code-base",
        "code-sm",
      ],
      shadow: ["card"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
