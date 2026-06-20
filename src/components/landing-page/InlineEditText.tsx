"use client";

import { Edit, Loader2, Save, X } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface InlineEditTextProps {
  initialValue: string;
  isOwner: boolean;
  fieldKey: string; // e.g., "headline", "features.0.title"
  onSave: (fieldKey: string, newValue: string) => Promise<void>;
  onCancel?: () => void; // Added: Optional cancel handler
  hideControls?: boolean; // Added: Option to hide default buttons
  as?: "p" | "h1" | "h2" | "h3" | "textarea" | "span";
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  placeholder?: string;
}

export function InlineEditText({
  initialValue,
  isOwner,
  fieldKey,
  onSave,
  onCancel, // Receive onCancel
  hideControls = false, // Receive hideControls
  as = "p",
  className = "",
  inputClassName = "",
  buttonClassName = "",
  placeholder = "Klik untuk mengedit...",
}: InlineEditTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null); // Ref for the edit mode wrapper

  const handleCancelInternal = useCallback(() => {
    setCurrentValue(initialValue); // Revert changes
    setIsEditing(false);
    if (onCancel) {
      onCancel(); // Call the passed-in cancel handler
    }
  }, [initialValue, onCancel]);

  // Update internal state if initialValue changes from parent
  useEffect(() => {
    if (!isEditing) {
      setCurrentValue(initialValue);
    }
  }, [initialValue, isEditing]);

  // Focus and select text
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      } else if (inputRef.current instanceof HTMLTextAreaElement) {
        // Optional: move cursor to end for textareas
        // inputRef.current.setSelectionRange(currentValue.length, currentValue.length);
      }
    }
  }, [isEditing]);

  // Auto-resize textarea height (simple version)
  useEffect(() => {
    if (
      isEditing &&
      inputRef.current &&
      inputRef.current instanceof HTMLTextAreaElement
    ) {
      inputRef.current.style.height = "auto"; // Reset height
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`; // Set to scroll height
    }
  }, [isEditing, currentValue]); // Re-run when editing or value changes

  // Click outside detection to cancel edit (only if controls are NOT hidden)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        !hideControls && // Only if default controls are shown
        isEditing &&
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        handleCancelInternal();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isEditing, hideControls, handleCancelInternal]); // Add dependencies

  const handleSave = async () => {
    if (currentValue === initialValue) {
      setIsEditing(false); // No changes, just exit edit mode
      return;
    }

    setIsSaving(true);
    try {
      await onSave(fieldKey, currentValue);
      setIsEditing(false);
      // Optional: Show success toast, but might be too noisy if editing a lot
      // toast.success("Perubahan disimpan!");
    } catch (error) {
      console.error(`Error saving field ${fieldKey}:`, error);
      toast.error("Gagal Menyimpan", {
        description:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat menyimpan perubahan.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (e.key === "Enter" && !(as === "textarea" && e.shiftKey)) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancelInternal();
    }
    // Adjust height on keydown for textarea
    if (as === "textarea" && inputRef.current instanceof HTMLTextAreaElement) {
      setTimeout(() => {
        // Use timeout to allow value to update
        if (inputRef.current) {
          inputRef.current.style.height = "auto";
          inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        }
      }, 0);
    }
  };

  // Remove default browser styling from input/textarea for Notion feel
  const notionInputStyles =
    "border-none bg-transparent focus:ring-0 focus:outline-none p-0 m-0 w-full";

  const commonInputProps = {
    ref: inputRef,
    value: currentValue,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
      setCurrentValue(e.target.value);
    },
    onKeyDown: handleKeyDown,
    // onBlur is now handled by click outside detection
    className: cn("text-base resize-none", notionInputStyles, inputClassName), // Apply Notion styles
    disabled: isSaving,
    placeholder: placeholder,
    // Auto-adjust height for textarea on input change - Use FormEventHandler
    onInput: (e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.currentTarget instanceof HTMLTextAreaElement) {
        e.currentTarget.style.height = "auto";
        e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
      }
    },
  };

  if (isOwner) {
    if (isEditing) {
      // EDIT MODE - Apply Notion-like styles
      return (
        // Use the wrapperRef for click outside detection
        <div
          ref={wrapperRef}
          className={cn("inline-edit-active relative w-full", className)}
        >
          {as === "textarea" ? (
            <Textarea
              {...commonInputProps}
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              rows={1} // Start with 1 row, auto-adjust height
              style={{ overflow: "hidden" }} // Hide scrollbar during auto-adjust
            />
          ) : (
            <Input
              {...commonInputProps}
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
            />
          )}

          {/* Conditionally render controls (Improved Positioning) */}
          {!hideControls && (
            // Position controls slightly below and to the right, appearing on focus/edit
            // Use focus-within on the parent? Or manage visibility state
            <div className="absolute top-full right-0 flex items-center space-x-1 mt-1.5 z-10 opacity-100 transition-opacity duration-150">
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className={cn("h-6 px-1.5 text-xs", buttonClassName)} // Smaller buttons
                aria-label="Simpan"
              >
                {isSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelInternal}
                disabled={isSaving}
                className={cn("h-6 px-1.5 text-xs", buttonClassName)} // Smaller buttons
                aria-label="Batal"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      );
    } else {
      // VIEW MODE (Owner) - Make the entire area clickable
      const Tag = as === "textarea" ? "p" : as;
      return (
        <Tag
          className={cn(
            "cursor-pointer relative group border border-transparent hover:bg-surface-muted/50 focus:bg-surface-muted/50 focus:outline-none focus:ring-1 focus:ring-action-primary p-1 -m-1 rounded-radius-sm transition-colors duration-150 ease-in-out min-h-[1em] w-full block", // Make block to allow click anywhere
            className
          )}
          onClick={() => setIsEditing(true)}
          onFocus={() => setIsEditing(true)}
          tabIndex={0}
          role="button"
          aria-label={`Edit ${fieldKey}`}
        >
          {/* Render placeholder if empty */}
          {currentValue && currentValue.trim() !== "" ? (
            // Handle potential newlines in view mode for textarea-like content
            as === "textarea" ? (
              currentValue.split("\n").map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  <br />
                </React.Fragment>
              ))
            ) : (
              currentValue
            )
          ) : (
            <span className="text-text-secondary italic opacity-70">
              {placeholder}
            </span>
          )}
          {/* Simplified Edit icon, appears on hover/focus */}
          <Edit className="h-3 w-3 absolute top-1 right-1 text-text-secondary opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity pointer-events-none" />
        </Tag>
      );
    }
  } else {
    // VIEW MODE (Non-Owner) - Handle potential newlines
    const Tag = as === "textarea" ? "p" : as;
    return (
      <Tag className={cn("w-full block", className)}>
        {as === "textarea" && initialValue
          ? initialValue.split("\n").map((line, i) => (
              <React.Fragment key={i}>
                {line}
                <br />
              </React.Fragment>
            ))
          : initialValue}
      </Tag>
    );
  }
}
