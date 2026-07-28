import { useId } from "react";

import { cn } from "@/lib/utils";

const FIELD_LABEL_CLASSES = "text-xs font-semibold text-surface-warm-white/80";
const FIELD_REQUIRED_ICON = <span className="text-aurora-rose"> *</span>;
const FIELD_INPUT_BASE =
  "w-full rounded-radius-md border bg-transparent px-spacing-4 text-sm text-surface-warm-white outline-none transition placeholder:text-surface-warm-white/30 disabled:opacity-50";
const FIELD_INPUT_VALID =
  "border-surface-warm-white/10 focus:border-aurora-orange/50 focus:ring-1 focus:ring-aurora-orange";
const FIELD_INPUT_INVALID =
  "border-aurora-rose/60 focus:border-aurora-rose focus:ring-1 focus:ring-aurora-rose";
const FIELD_ERROR_CLASSES = "mt-spacing-1 text-xs text-aurora-rose";

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

/**
 * Single-source renderer for label + hint + error. The render-prop lets us
 * compose <input>, <select>, <textarea> without duplicating the border-on-
 * invalid styling across every primitive.
 */
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
        onBlur: () => {
          /* owner calls markTouched from useValidatedForm */
        },
      })}
      {hint && !invalid ? (
        <span className="text-xs text-surface-warm-white/50">{hint}</span>
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
  invalid: boolean;
}) =>
  cn(
    "rounded-full border px-spacing-4 py-spacing-2 text-sm transition",
    active
      ? invalid
        ? "border-aurora-rose/60 bg-aurora-rose/15 text-aurora-rose"
        : "border-aurora-orange bg-aurora-orange/15 text-aurora-orange"
      : invalid
        ? "border-aurora-rose/40 text-surface-warm-white/70 hover:border-aurora-rose/70 hover:text-surface-warm-white"
        : "border-surface-warm-white/10 text-surface-warm-white/70 hover:border-surface-warm-white/30 hover:text-surface-warm-white",
  );
