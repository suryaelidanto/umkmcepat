import { type UIMessage } from "ai";

import { isUserVisibleAssistantText } from "@/lib/projects/workspace-sync";

export function stripTransportDiagnosticMessages(messages: UIMessage[]) {
  return messages
    .map((message) => {
      if (message.role !== "assistant") {
        return message;
      }

      return {
        ...message,
        parts: message.parts.filter(
          (part) =>
            part.type !== "text" || isUserVisibleAssistantText(part.text),
        ),
      } satisfies UIMessage;
    })
    .filter((message) => message.role !== "assistant" || message.parts.length);
}
