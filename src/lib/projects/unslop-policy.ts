export function unslopUserFacingText(value: string): string {
  return value
    .replaceAll(/[—–]/gu, ",")
    .replaceAll(/[“”]/gu, '"')
    .replaceAll(/[‘’]/gu, "'")
    .replace(
      /\b(?:of course|certainly|great question|i hope this helps)\b[,!]?\s*/giu,
      "",
    )
    .replace(
      /\b(?:semoga membantu|pertanyaan bagus|tentu saja)\b[.!]?\s*/giu,
      "",
    )
    .replace(/\s+/gu, " ")
    .trim();
}

export const UNSLOP_SYSTEM_INSTRUCTION = `Unslop every user-visible sentence before returning it.

Write plain, specific language that sounds like a person who has read this business brief. Cut puffery, promotional adjectives, vague praise, generic conclusions, chatbot phrases, excessive hedging, decorative emojis, title-case headings, em dashes, curly quotes, and needless colons. Avoid "not just X, but Y", forced lists of three, synonym cycling, and abstract metaphors. Prefer short sentences, active voice, concrete verbs, and sentence-case headings. Do not say "Of course", "Great question", "I hope this helps", "Let me know if", or claim that something is professional, trusted, high quality, affordable, best, favorite, or beautiful unless that exact claim is owner-confirmed. Preserve the user's meaning and register. Never turn an AI suggestion, unknown, declined detail, or assistant wording into a business fact.`;
