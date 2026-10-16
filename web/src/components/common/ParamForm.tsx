import { useId } from "react";
import type { ParamValue } from "@/api/types";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Field } from "./Field";

export interface FieldSpec {
  key: string;
  label: string;
  kind: "text" | "number" | "select";
  options?: { value: string; label: string }[];
  hint?: string;
  placeholder?: string;
  wide?: boolean;
  step?: string;
}

interface ParamFormProps {
  fields: FieldSpec[];
  values: Record<string, ParamValue>;
  disabled?: boolean;
  onChange: (key: string, value: string) => void;
}

// Radix Select cannot hold an empty value; map "" to a sentinel and back.
const EMPTY = "__default__";

/** A responsive grid of labelled inputs driven by field specs (values are kept as text). */
export function ParamForm({ fields, values, disabled, onChange }: ParamFormProps) {
  const formId = useId();
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
      {fields.map((field) => {
        const raw = values[field.key];
        const value = raw === null || raw === undefined ? "" : String(raw);
        return (
          <Field
            key={field.key}
            label={field.label}
            hint={field.hint}
            className={cn(field.wide && "sm:col-span-2 xl:col-span-3")}
            htmlFor={field.kind === "select" ? `${formId}-${field.key}` : undefined}
          >
            {field.kind === "select" ? (
              <Select
                value={value || EMPTY}
                disabled={disabled}
                onValueChange={(next) => onChange(field.key, next === EMPTY ? "" : next)}
              >
                <SelectTrigger id={`${formId}-${field.key}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {field.options?.map((option) => (
                    <SelectItem key={option.value || EMPTY} value={option.value || EMPTY}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                type={field.kind === "number" ? "number" : "text"}
                step={field.step ?? "any"}
                value={value}
                placeholder={field.placeholder}
                disabled={disabled}
                onChange={(e) => onChange(field.key, e.target.value)}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}
