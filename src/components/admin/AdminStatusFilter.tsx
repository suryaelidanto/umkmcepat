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
              "rounded-radius-md px-spacing-3 py-spacing-2 text-sm font-medium transition-colors",
              active
                ? "bg-black/10 text-[#1c1c1c] dark:bg-surface-warm-white/15 dark:text-surface-warm-white"
                : "border border-black/15 bg-black/[0.03] text-[#5f5f5d] hover:bg-black/[0.06] hover:text-[#1c1c1c] dark:border-surface-warm-white/15 dark:bg-transparent dark:text-surface-warm-white/70 dark:hover:bg-surface-warm-white/5",
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
