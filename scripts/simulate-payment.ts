/* eslint-disable no-console */
import readline from "node:readline";

import { BOOSTER_PACKS, createMayarPayment } from "../src/lib/mayar";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> =>
  new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log("\n=== MAYAR PAYMENT SIMULATION CLI (sandbox) ===");

  const apiKey = process.env.MAYAR_API_KEY;
  const baseUrl = process.env.MAYAR_API_BASE_URL;

  if (!apiKey || !baseUrl) {
    console.error(
      "Error: Missing MAYAR_API_KEY or MAYAR_API_BASE_URL in environment variables.",
    );
    rl.close();
    process.exit(1);
  }

  if (!baseUrl.includes("mayar.club")) {
    console.error(
      "Error: MAYAR_API_BASE_URL does not look like the sandbox host " +
        "(api.mayar.club). Refusing to run against what looks like production.",
    );
    rl.close();
    process.exit(1);
  }

  const orderId = await question(
    "Enter Order/Invoice ID (e.g. INV-ABCD-172138): ",
  );
  if (!orderId.trim()) {
    console.error("Error: Order ID is required.");
    rl.close();
    process.exit(1);
  }

  console.log("\nSelect Package:");
  const packs = Object.entries(BOOSTER_PACKS);
  packs.forEach(([, pack], index) => {
    console.log(
      `${index + 1}. ${pack.name} (Rp ${pack.amount.toLocaleString("id-ID")})`,
    );
  });
  console.log(`${packs.length + 1}. Enter custom amount`);

  const choiceStr = await question(`Choose option (1-${packs.length + 1}): `);
  const choice = parseInt(choiceStr.trim(), 10);

  let amount = 0;
  let packName = "Simulation Payment";
  if (choice >= 1 && choice <= packs.length) {
    const [, pack] = packs[choice - 1];
    amount = pack.amount;
    packName = pack.name;
  } else if (choice === packs.length + 1) {
    const customAmountStr = await question("Enter custom amount (e.g. 5000): ");
    amount = parseInt(customAmountStr.trim(), 10);
  } else {
    console.error("Error: Invalid option chosen.");
    rl.close();
    process.exit(1);
  }

  if (isNaN(amount) || amount <= 0) {
    console.error("Error: Payment amount must be a positive integer.");
    rl.close();
    process.exit(1);
  }

  console.log(`\nCreating sandbox payment request:`);
  console.log(`- Order ID: ${orderId}`);
  console.log(`- Amount: Rp ${amount.toLocaleString("id-ID")}`);

  try {
    const payment = await createMayarPayment({
      orderId: orderId.trim(),
      amount,
      packName,
      expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    console.log("\n✅ Payment request created in Mayar sandbox!");
    console.log(`- transactionId: ${payment.transactionId}`);
    console.log(`- Open this link to pay: ${payment.link}`);
    console.log(
      "\nAfter paying, check your dev server logs or the local webhook " +
        "history in the Mayar sandbox dashboard for the delivered webhook.",
    );
  } catch (error) {
    console.error("\n❌ Failed to create sandbox payment:", error);
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  rl.close();
});
