import { useId } from "react";

import { cn } from "@/lib/utils";

const FIELD_LABEL_CLASSES =
  "text-xs font-semibold text-[#1c1c1c] dark:text-surface-warm-white/80";
const FIELD_REQUIRED_ICON = <span className="text-destructive"> *</span>;
const FIELD_INPUT_BASE =
  "w-full rounded-radius-md border bg-transparent px-spacing-4 text-sm text-[#1c1c1c] outline-none transition placeholder:text-black/30 disabled:opacity-50 dark:text-surface-warm-white dark:placeholder:text-surface-warm-white/30";
const FIELD_INPUT_VALID =
  "border-black/15 focus:border-accent-orange focus:ring-1 focus:ring-accent-orange dark:border-surface-warm-white/10";
const FIELD_INPUT_INVALID =
  "border-destructive focus:border-destructive focus:ring-1 focus:ring-destructive";
const FIELD_ERROR_CLASSES = "mt-spacing-1 text-xs text-destructive";

export type FormFieldProps = {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  className?: string;
  children: (props: {
    id: string;
    invalid: boolean;
    onBlur: () => void;
  }) => React.ReactNode;
};

export function FormField({
  label,
  required,
  hint,
  error,
  className,
  children,
}: FormFieldProps) {
  const id = useId();
  const invalid = Boolean(error);
  return (
    <div className={cn("flex flex-col gap-spacing-1", className)}>
      <label htmlFor={id} className={FIELD_LABEL_CLASSES}>
        {label}
        {required ? FIELD_REQUIRED_ICON : null}
      </label>
      {children({
        id,
        invalid,
        onBlur: () => {},
      })}
      {hint && !invalid ? (
        <span className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/50">
          {hint}
        </span>
      ) : null}
      {invalid ? <span className={FIELD_ERROR_CLASSES}>{error}</span> : null}
    </div>
  );
}

export const textInputClass = ({
  invalid,
  height = "h-11",
}: {
  invalid: boolean;
  height?: string;
}) =>
  cn(
    FIELD_INPUT_BASE,
    height,
    invalid ? FIELD_INPUT_INVALID : FIELD_INPUT_VALID,
  );

export const chipClass = ({
  active,
  invalid,
}: {
  active: boolean;
  invalid?: boolean;
}) =>
  cn(
    "rounded-radius-md border px-spacing-3 py-spacing-2 text-xs font-semibold transition",
    active
      ? "border-accent-orange-border bg-accent-orange-subtle text-accent-orange"
      : invalid
        ? "border-destructive-border text-destructive hover:border-destructive"
        : "border-black/15 bg-black/[0.04] text-[#1c1c1c] hover:bg-black/[0.08] dark:border-surface-warm-white/10 dark:bg-transparent dark:text-surface-warm-white dark:hover:bg-surface-warm-white/5",
  );
