"use client";

import { type UIMessage } from "ai";

export const chatBubbleClass = (
  role: "user" | "assistant" | "system",
): string =>
  `max-w-[88%] overflow-hidden break-words rounded-[22px] px-spacing-4 py-spacing-3 sm:px-spacing-6 sm:py-spacing-5 ${
    role === "user"
      ? "border border-surface-warm-white/12 bg-[#30302c] text-surface-warm-white/88"
      : "border border-surface-warm-white/10 bg-[#242421] text-surface-warm-white/80"
  }`;

export function ChatMessages({ messages }: { messages: UIMessage[] }) {
  if (!messages.length) {
    return null;
  }

  return (
    <div className="space-y-spacing-8">
      {messages.map((message, messageIndex) => {
        const textParts = message.parts.filter(
          (
            part,
          ): part is Extract<
            (typeof message.parts)[number],
            { type: "text" }
          > => part.type === "text" && Boolean(part.text.trim()),
        );

        if (!textParts.length) {
          return null;
        }

        return (
          <div
            key={`${message.id || message.role}-${messageIndex}`}
            className={`flex max-w-full text-base leading-7 ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className={chatBubbleClass(message.role)}>
              {textParts.map((part, index) => (
                <MessageText key={index} text={part.text} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MessageText({ text }: { text: string }) {
  const lines = stripDecorativeSymbols(text)
    .split("\n")
    .filter((line) => line.trim());

  return (
    <div className="space-y-spacing-4">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        const listMatch = trimmed.match(/^(\d+\.|[-*])\s+(.*)$/);

        if (listMatch) {
          return (
            <p
              key={index}
              className="break-words pl-spacing-4 text-surface-warm-white/72"
            >
              <span className="text-[#ffb38d]">{listMatch[1]}</span>{" "}
              {formatInlineMarkdown(listMatch[2])}
            </p>
          );
        }

        if (trimmed.startsWith("###")) {
          return (
            <p
              key={index}
              className="break-words font-semibold text-surface-warm-white"
            >
              {formatInlineMarkdown(trimmed.replace(/^#+\s*/, ""))}
            </p>
          );
        }

        return (
          <p key={index} className="break-words">
            {formatInlineMarkdown(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function stripDecorativeSymbols(text: string) {
  return text.replace(
    /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu,
    "",
  );
}

function formatInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold text-surface-warm-white">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}
