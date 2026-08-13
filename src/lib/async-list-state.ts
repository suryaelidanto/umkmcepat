export type AsyncListState = "content" | "empty" | "error" | "loading";

export function resolveAsyncListState<T>(input: {
  isError: boolean;
  isPending: boolean;
  items: readonly T[] | undefined;
}): AsyncListState {
  if (input.isPending) {
    return "loading";
  }
  if (input.items?.length) {
    return "content";
  }
  if (input.isError) {
    return "error";
  }
  return "empty";
}
