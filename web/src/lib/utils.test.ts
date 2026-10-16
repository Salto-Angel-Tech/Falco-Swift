import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps custom font-size tokens next to text colors", () => {
    expect(cn("text-body", "text-muted-foreground")).toBe("text-body text-muted-foreground");
    expect(cn("font-mono text-code-sm", "text-primary")).toBe("font-mono text-code-sm text-primary");
  });

  it("lets a later custom font-size replace an earlier one", () => {
    expect(cn("text-body", "text-caption")).toBe("text-caption");
  });

  it("still merges conflicting colors", () => {
    expect(cn("text-muted-foreground", "text-primary")).toBe("text-primary");
  });
});
