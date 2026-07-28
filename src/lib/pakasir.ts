export const BOOSTER_PACKS = {
  pocket: { amount: 2900, energy: 50000, name: "Pocket Booster" },
  starter: { amount: 8900, energy: 200000, name: "Starter Booster" },
  popular: { amount: 24900, energy: 600000, name: "Popular Booster" },
  max: { amount: 59900, energy: 1500000, name: "Max Booster" },
} as const;

export type BoosterPackId = keyof typeof BOOSTER_PACKS;

export interface PakasirTransactionDetail {
  id: string;
  project: string;
  order_id: string;
  amount: number;
  payment_method: string;
  payment_number: string;
  status: "pending" | "completed" | "failed" | string;
  completed_at?: string;
  expired_at?: string;
  created_at: string;
  updated_at: string;
}

const PAKASIR_BASE_URL = "https://app.pakasir.com/api";

function getCredentials() {
  const apiKey = process.env.PAKASIR_API_KEY;
  const projectSlug = process.env.PAKASIR_PROJECT_SLUG;

  if (!apiKey || !projectSlug) {
    throw new Error(
      "Missing PAKASIR_API_KEY or PAKASIR_PROJECT_SLUG in environment variables",
    );
  }

  return { apiKey, projectSlug };
}

/**
 * Validates a transaction directly against the Pakasir API.
 * This is crucial since webhook payloads have no signatures.
 */
export async function verifyPakasirTransaction(opts: {
  orderId: string;
  amount: number;
}): Promise<PakasirTransactionDetail> {
  const { apiKey, projectSlug } = getCredentials();

  const queryParams = new URLSearchParams({
    project: projectSlug,
    amount: String(opts.amount),
    order_id: opts.orderId,
    api_key: apiKey,
  });

  const url = `${PAKASIR_BASE_URL}/transactiondetail?${queryParams.toString()}`;

  const response = await fetch(url, {
    method: "GET",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Pakasir get transaction detail failed with status ${response.status}: ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    transaction?: PakasirTransactionDetail;
  } | null;

  if (!data?.transaction) {
    throw new Error(
      `Pakasir transaction details not found for orderId ${opts.orderId}`,
    );
  }

  return data.transaction;
}
