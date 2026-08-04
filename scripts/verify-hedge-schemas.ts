/* eslint-disable no-console */
// Deploy-time gate: verify each configured discuss combo accepts the
// workspace-card tool schema. A 422 ($schema rejection class) on any combo
// blocks rollout — the fix is to update the combo's backing providers in
// 9Router, never to ship the broken leg. Not a unit test: requires live
// infra (9Router + .env) via `bun run scripts/verify-hedge-schemas.ts`.

import { streamText } from "ai";

import { getAiModel } from "../src/lib/ai";
import { getDiscussHedgeModels, getDiscussModel } from "../src/lib/ai-models";
import {
  PRESENT_WORKSPACE_CARD_TOOL_NAME,
  presentWorkspaceCardTool,
} from "../src/lib/projects/discuss-tool";

const TINY_SYSTEM = "Reply by calling the card tool once. No prose.";
const TINY_USER = "Saya jual kopi.";
const TIMEOUT_MS = 30_000;

async function probe(comboId: string): Promise<string | null> {
  try {
    const result = streamText({
      model: getAiModel(comboId),
      system: TINY_SYSTEM,
      messages: [{ role: "user", content: TINY_USER }],
      tools: { [PRESENT_WORKSPACE_CARD_TOOL_NAME]: presentWorkspaceCardTool },
      toolChoice: { type: "tool", toolName: PRESENT_WORKSPACE_CARD_TOOL_NAME },
      maxOutputTokens: 256,
      timeout: TIMEOUT_MS,
    });
    for await (const part of result.fullStream) {
      if (part.type === "error") {
        throw part.error;
      }
      if (part.type === "tool-call") {
        return null;
      }
    }
    return "no tool-call emitted";
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return msg.slice(0, 200);
  }
}

const combos = [getDiscussModel(), ...getDiscussHedgeModels()];
console.log(`verify-hedge-schemas: probing ${combos.length} discuss combos`);
const failures: string[] = [];
for (const combo of combos) {
  const error = await probe(combo);
  if (error) {
    failures.push(combo);
    console.error(`  ✗ ${combo}: ${error}`);
  } else {
    console.log(`  ✓ ${combo}`);
  }
}
if (failures.length > 0) {
  console.error(
    `\nverify-hedge-schemas FAILED: ${failures.length} combo(s) rejected the card tool schema.\n` +
      "Update the backing providers in 9Router before enabling discuss hedging.",
  );
  process.exit(1);
}
