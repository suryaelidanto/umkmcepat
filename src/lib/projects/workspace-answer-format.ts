import { type BriefQuestion } from "@/lib/projects/brief";

// Option descriptions are UI helper text, not part of the answer. Record the
export function formatWorkspaceAnswerSelection(
  _question: BriefQuestion,
  selected: string[],
  source: "custom" | "option",
) {
  if (source === "custom") {
    return selected.join(", ");
  }
  return selected.join("; ");
}
