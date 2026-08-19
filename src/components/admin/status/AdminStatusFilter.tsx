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
              "rounded-lg px-spacing-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              active
                ? "bg-[#1c1c1c] text-white shadow-xs dark:bg-surface-warm-white dark:text-[#1c1c1c]"
                : "border border-black/15 bg-white text-[#5f5f5d] hover:bg-black/[0.04] hover:text-[#1c1c1c] dark:border-white/15 dark:bg-white/[0.04] dark:text-surface-warm-white/70 dark:hover:bg-white/[0.08] dark:hover:text-surface-warm-white",
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
