export function isPrismaDatabaseUnavailable(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["P1001", "P1002", "P1017"].includes(String(error.code))
  );
}
