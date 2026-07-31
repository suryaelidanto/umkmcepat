import { cn } from "@/lib/utils";

export type AdminFilterOption = {
  value: string;
  label: string;
};

/** Shared status chip row — matches /admin/transactions look. */
export function AdminStatusFilter({
  options,
  value,
  onChange,
}: {
  options: readonly AdminFilterOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-spacing-2">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            className={cn(
              "rounded-radius-md px-spacing-3 py-spacing-2 text-sm",
              active
                ? "bg-surface-warm-white/15 text-surface-warm-white"
                : "border border-surface-warm-white/15 text-surface-warm-white/70",
            )}
            key={opt.value}
            onClick={() => onChange(opt.value)}
            type="button"
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
