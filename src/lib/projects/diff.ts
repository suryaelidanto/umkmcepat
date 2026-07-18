export type DiffLine = { text: string; type: "add" | "delete" | "normal" };

/** Line-level LCS diff. Pure JS, no deps — fine for typical file sizes here. */
export function generateDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const lcs: number[][] = Array.from({ length: oldLines.length + 1 }, () =>
    new Array<number>(newLines.length + 1).fill(0),
  );

  for (let i = oldLines.length - 1; i >= 0; i -= 1) {
    for (let j = newLines.length - 1; j >= 0; j -= 1) {
      lcs[i][j] =
        oldLines[i] === newLines[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      result.push({ text: oldLines[i], type: "normal" });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ text: oldLines[i], type: "delete" });
      i += 1;
    } else {
      result.push({ text: newLines[j], type: "add" });
      j += 1;
    }
  }

  while (i < oldLines.length) {
    result.push({ text: oldLines[i], type: "delete" });
    i += 1;
  }

  while (j < newLines.length) {
    result.push({ text: newLines[j], type: "add" });
    j += 1;
  }

  return result;
}
