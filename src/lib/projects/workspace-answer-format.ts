import { type BriefQuestion } from "@/lib/projects/brief";

export function formatWorkspaceAnswerSelection(
  question: BriefQuestion,
  selected: string[],
  source: "custom" | "option",
) {
  if (source === "custom") {
    return selected.join(", ");
  }

  return selected
    .map((label) => {
      const option = question.options.find((item) => item.label === label);

      if (!option) {
        return label;
      }

      return `${option.label} (${option.description})`;
    })
    .join("; ");
}
