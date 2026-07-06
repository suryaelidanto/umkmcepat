import { describe, expect, it } from "vitest";

import {
  isRepoOwnedPortCommand,
  parseWindowsNetstatListeningPids,
} from "@/lib/dev-port";

describe("dev port helpers", () => {
  it("parses Windows netstat listeners for one port", () => {
    const output = `
  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       18616
  TCP    [::]:3000              [::]:0                 LISTENING       18616
  TCP    127.0.0.1:3001         0.0.0.0:0              LISTENING       19000
`;

    expect(parseWindowsNetstatListeningPids(output, 3000)).toEqual([18616]);
  });

  it("accepts only command lines clearly owned by this repo", () => {
    expect(
      isRepoOwnedPortCommand({
        commandLine:
          "C:\\Program Files\\nodejs\\node.exe D:\\Code\\Side\\umkmcepat\\node_modules\\next\\dist\\server\\lib\\start-server.js",
        repoRoot: "D:\\Code\\Side\\umkmcepat",
      }),
    ).toBe(true);
    expect(
      isRepoOwnedPortCommand({
        commandLine:
          "C:\\Program Files\\nodejs\\node.exe D:\\Other\\app\\server.js",
        repoRoot: "D:\\Code\\Side\\umkmcepat",
      }),
    ).toBe(false);
  });
});
