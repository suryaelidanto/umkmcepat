"use client";

import { Check, Hammer, MessagesSquare } from "lucide-react";
import { useId, useRef, useState } from "react";

export type WorkspaceMode = "discuss" | "build";

type ModeOption = {
  value: WorkspaceMode;
  label: string;
  description: string;
  Icon: typeof MessagesSquare;
};

const options: ModeOption[] = [
  {
    value: "discuss",
    label: "Diskusi",
    description: "Bahas dulu kebutuhan usahamu",
    Icon: MessagesSquare,
  },
  {
    value: "build",
    label: "Buat",
    description: "Langsung buat website",
    Icon: Hammer,
  },
];

export function ModeSelect({
  value,
  onChange,
}: {
  value: WorkspaceMode;
  onChange: (mode: WorkspaceMode) => void;
}) {
  const listboxId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const selected =
    options.find((option) => option.value === value) ?? options[0];
  const SelectedIcon = selected.Icon;

  function toggleOpen() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setPlacement(
        spaceBelow >= 150 || spaceBelow >= spaceAbove ? "bottom" : "top",
      );
    }

    setOpen((current) => !current);
  }

  function selectMode(mode: WorkspaceMode) {
    onChange(mode);
    setOpen(false);
  }

  return (
    <div className="relative z-50">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={toggleOpen}
        onBlur={(event) => {
          if (
            !event.currentTarget.parentElement?.contains(event.relatedTarget)
          ) {
            setOpen(false);
          }
        }}
        className="grid min-h-10 w-40 grid-cols-[22px_1fr_16px] items-center gap-spacing-4 rounded-radius-lg border border-surface-warm-white/14 bg-surface-warm-white/8 px-spacing-4 py-spacing-3 text-sm text-surface-warm-white outline-none transition hover:bg-surface-warm-white/12 focus-visible:ring-2 focus-visible:ring-surface-warm-white/70 active:translate-y-px sm:min-h-12 sm:w-56 sm:grid-cols-[24px_1fr_18px]"
      >
        <span className="flex size-6 items-center justify-center rounded-radius-md bg-surface-warm-white/12 text-surface-warm-white sm:size-7">
          <SelectedIcon className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 text-left">
          <span className="block font-semibold leading-5">
            {selected.label}
          </span>
          <span className="hidden truncate text-xs leading-4 text-surface-warm-white/54 sm:block">
            {selected.description}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`mx-auto size-2 rotate-45 border-b-2 border-r-2 border-current opacity-82 transition ${open ? "mt-1 rotate-[225deg]" : "-mt-1"}`}
        />
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className={`${placement === "bottom" ? "top-full mt-spacing-2" : "bottom-full mb-spacing-2"} absolute left-0 z-50 w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-radius-xl border border-surface-warm-white/12 bg-[#1f1f1d] p-spacing-2 shadow-[0_18px_48px_rgba(0,0,0,0.24)] sm:w-80`}
        >
          {options.map((option) => {
            const Icon = option.Icon;
            const isSelected = option.value === selected.value;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectMode(option.value)}
                className="grid w-full grid-cols-[28px_1fr_18px] items-center gap-spacing-4 rounded-radius-lg px-spacing-4 py-spacing-4 text-left text-sm text-surface-warm-white/78 outline-none transition hover:bg-surface-warm-white/8 focus-visible:bg-surface-warm-white/8 aria-selected:bg-surface-warm-white/10 aria-selected:text-surface-warm-white"
              >
                <span className="flex size-7 items-center justify-center rounded-radius-md bg-surface-warm-white/10 text-surface-warm-white">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold leading-5">
                    {option.label}
                  </span>
                  <span className="block text-xs leading-5 text-surface-warm-white/54">
                    {option.description}
                  </span>
                </span>
                <Check
                  className={`size-4 text-surface-warm-white transition ${isSelected ? "opacity-100" : "opacity-0"}`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
