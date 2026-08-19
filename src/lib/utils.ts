import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const isDev =
  Boolean(
    typeof import.meta !== "undefined" &&
    typeof import.meta.env?.DEV === "boolean" &&
    import.meta.env.DEV,
  ) ||
  (typeof process !== "undefined" &&
    Boolean(process.env?.NODE_ENV) &&
    process.env.NODE_ENV !== "production") ||
  (typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname.endsWith("dev.umkmcepat.com")));
