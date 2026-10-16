import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface StringListEditorProps {
  label: string;
  items: string[];
  ordered?: boolean;
  onChange: (items: string[]) => void;
}

/** Edit a list of strings; ordered lists (score levels) can be reordered. */
export function StringListEditor({ label, items, ordered = false, onChange }: StringListEditorProps) {
  const update = (index: number, value: string) =>
    onChange(items.map((item, i) => (i === index ? value : item)));
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2" role="group" aria-label={label}>
      <span className="text-[13px] font-medium text-muted-foreground capitalize">{label}</span>
      {items.map((item, index) => (
        <div className="flex items-center gap-1.5" key={index}>
          {ordered && (
            <span className="w-5 shrink-0 text-center font-mono text-caption text-text-3">{index}</span>
          )}
          <Input
            aria-label={`${label} ${index + 1}`}
            value={item}
            onChange={(e) => update(index, e.target.value)}
          />
          {ordered && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Move up"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Move down"
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${label} ${index + 1}`}
            onClick={() => remove(index)}
          >
            <X />
          </Button>
        </div>
      ))}
      <div>
        <Button variant="outline" size="sm" onClick={() => onChange([...items, ""])}>
          <Plus />
          Add {label.replace(/s$/, "")}
        </Button>
      </div>
    </div>
  );
}
