import { describe, expect, it } from "vitest";

import {
  assertSafeProjectFilePath,
  parseGeneratedProjectFiles,
} from "./generated-source";

describe("generated project source", () => {
  it("keeps valid stored files only", () => {
    expect(
      parseGeneratedProjectFiles([
        { path: "src/App.tsx", content: "export default function App() {}" },
        { path: 123, content: "bad" },
        null,
      ]),
    ).toEqual([
      { path: "src/App.tsx", content: "export default function App() {}" },
    ]);
  });

  it("rejects unsafe paths", () => {
    expect(() => assertSafeProjectFilePath("../secret.ts")).toThrow();
    expect(() => assertSafeProjectFilePath("C:/secret.ts")).toThrow();
    expect(() => assertSafeProjectFilePath("node_modules/x.js")).toThrow();
    expect(() => assertSafeProjectFilePath(".env")).toThrow();
  });
});
