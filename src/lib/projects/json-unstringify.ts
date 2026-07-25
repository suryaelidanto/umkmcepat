// Tolerate the combo model double-encoding a nested object field as a JSON
// string (e.g. briefPatch: "{\"businessType\":\"retail\"}").
export function unstringifyJsonObject<T>(value: T): T {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return value;
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return value;
  }
}
