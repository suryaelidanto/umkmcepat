/* eslint-disable no-console */
import readline from "node:readline";

import { BOOSTER_PACKS } from "../src/lib/pakasir";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> =>
  new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log("\n=== PAKASIR PAYMENT SIMULATION CLI ===");

  const apiKey = process.env.PAKASIR_API_KEY;
  const projectSlug = process.env.PAKASIR_PROJECT_SLUG;

  if (!apiKey || !projectSlug) {
    console.error(
      "Error: Missing PAKASIR_API_KEY or PAKASIR_PROJECT_SLUG in environment variables.",
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
  const packs = Object.values(BOOSTER_PACKS);
  packs.forEach((pack, index) => {
    console.log(
      `${index + 1}. ${pack.name} (Rp ${pack.amount.toLocaleString("id-ID")})`,
    );
  });
  console.log(`${packs.length + 1}. Enter custom amount`);

  const choiceStr = await question(`Choose option (1-${packs.length + 1}): `);
  const choice = parseInt(choiceStr.trim(), 10);

  let amount = 0;
  if (choice >= 1 && choice <= packs.length) {
    amount = packs[choice - 1].amount;
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

  console.log(`\nRunning simulation:`);
  console.log(`- Project: ${projectSlug}`);
  console.log(`- Order ID: ${orderId}`);
  console.log(`- Amount: Rp ${amount.toLocaleString("id-ID")}`);

  try {
    const response = await fetch(
      "https://app.pakasir.com/api/paymentsimulation",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project: projectSlug,
          order_id: orderId,
          amount: amount,
          api_key: apiKey,
        }),
      },
    );

    const data = await response.json().catch(() => null);

    if (response.ok) {
      console.log("\n✅ Simulation request sent successfully to Pakasir!");
      console.log("Response:", JSON.stringify(data, null, 2));
      console.log(
        "\nPlease check your UI or local webhook server log for the status update.",
      );
    } else {
      console.error(
        `\n❌ Failed to trigger simulation (Status ${response.status})`,
      );
      console.error("Error Response:", JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error("\n❌ Network connection error occurred:", error);
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  rl.close();
});
