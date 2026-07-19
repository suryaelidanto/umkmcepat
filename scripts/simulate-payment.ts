/* eslint-disable no-console */
import readline from "node:readline";

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

  const amountStr = await question("Enter Amount (e.g. 2900): ");
  const amount = parseInt(amountStr.trim(), 10);
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
