export type MaskKind = "email" | "phone" | "name" | "orderId" | "amount";

const DASH = "—";
const MASK_CHAR = "•";

function isMissing(
  value: string | null | undefined,
): value is null | undefined {
  return value === null || value === undefined || value.trim() === "";
}

function maskChars(count: number): string {
  return MASK_CHAR.repeat(count);
}

export function mask(
  value: string | null | undefined,
  kind: MaskKind,
): { masked: string; revealable: boolean } {
  if (isMissing(value)) {
    return { masked: DASH, revealable: kind !== "amount" };
  }
  const text = value.trim();
  switch (kind) {
    case "email": {
      const at = text.lastIndexOf("@");
      if (at <= 0) {
        return { masked: DASH, revealable: true };
      }
      const local = text.slice(0, at);
      const domain = text.slice(at + 1);
      const dotIndex = domain.lastIndexOf(".");
      const tld = dotIndex > 0 ? domain.slice(dotIndex) : "";

      const maskedLocal =
        local.length <= 1
          ? `${local[0] ?? ""}${maskChars(3)}`
          : `${local[0]}${maskChars(3)}`;
      const maskedDomain =
        domain.length <= 3
          ? `${maskChars(3)}${tld}`
          : `${domain[0]}${maskChars(3)}${tld}`;

      return {
        masked: `${maskedLocal}@${maskedDomain}`,
        revealable: true,
      };
    }
    case "phone": {
      // Keep first 3 digits and last 2 digits, mask the rest.
      if (text.length < 6) {
        return { masked: DASH, revealable: true };
      }
      return {
        masked: `${text.slice(0, 3)}${maskChars(3)}${text.slice(-2)}`,
        revealable: true,
      };
    }
    case "name": {
      if (text.length < 4) {
        return { masked: DASH, revealable: true };
      }
      const words = text.split(/\s+/).filter(Boolean);
      if (words.length >= 2) {
        return {
          masked: `${words[0][0]}${maskChars(5)}${words[words.length - 1][0]}`,
          revealable: true,
        };
      }
      // single word: first 2 + last 1
      return {
        masked: `${text.slice(0, 2)}${maskChars(3)}${text.slice(-1)}`,
        revealable: true,
      };
    }
    case "orderId": {
      // Find the longest leading non-digit prefix (e.g. "INV-" or "").
      const match = text.match(/^(\D*)(.*)$/);
      if (!match || !match[2] || match[2].length < 3) {
        return { masked: DASH, revealable: true };
      }
      const [, prefix, rest] = match;
      const dots = prefix.length === 0 ? 4 : 3;
      return {
        masked: `${prefix}${maskChars(dots)}${rest.slice(-2)}`,
        revealable: true,
      };
    }
    case "amount": {
      return { masked: maskChars(8), revealable: false };
    }
  }
}
