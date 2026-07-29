import { getSetting } from "@/lib/app-settings";

export const BOOSTER_PACKS = {
  pocket: { amount: 2900, energy: 50000, name: "Pocket Booster" },
  starter: { amount: 8900, energy: 200000, name: "Starter Booster" },
  popular: { amount: 24900, energy: 600000, name: "Popular Booster" },
  max: { amount: 59900, energy: 1500000, name: "Max Booster" },
} as const;

export type BoosterPackId = keyof typeof BOOSTER_PACKS;

// Resolves a booster pack's amount/energy from AppSetting (DB-first),
// falling back to the hardcoded BOOSTER_PACKS const. Used at payment-creation
// (server, async). The client EnergyBoosterModal still reads the const for
// display — DB overrides apply only at actual transaction creation.
export async function getBoosterPack(id: BoosterPackId) {
  const fallback = BOOSTER_PACKS[id];
  const [amount, energy] = await Promise.all([
    getSetting<number>(`booster.${id}.amount`, fallback.amount),
    getSetting<number>(`booster.${id}.energy`, fallback.energy),
  ]);
  return { amount, energy, name: fallback.name };
}

export interface MayarCreatePaymentResponse {
  statusCode: number;
  messages: string;
  data?: {
    id: string;
    transactionId: string | null;
    link: string;
  };
}

export interface MayarTransactionDetail {
  status: string;
  amount: number;
  paymentMethod: string;
}

function getCredentials() {
  const apiKey = process.env.MAYAR_API_KEY;
  const baseUrl = process.env.MAYAR_API_BASE_URL;

  if (!apiKey || !baseUrl) {
    throw new Error(
      "Missing MAYAR_API_KEY or MAYAR_API_BASE_URL in environment variables",
    );
  }

  return { apiKey, baseUrl };
}

/**
 * Creates a payment request in Mayar. Returns the hosted checkout link
 * plus the request id. transactionId is null at create time — it is
 * populated by Mayar after the buyer completes payment and the webhook fires.
 */
export async function createMayarPayment(opts: {
  orderId: string;
  amount: number;
  packName: string;
  expiredAt: string; // ISO 8601, e.g. new Date(Date.now() + 24*60*60*1000).toISOString()
}): Promise<{ id: string; transactionId: string | null; link: string }> {
  const { apiKey, baseUrl } = getCredentials();

  const response = await fetch(`${baseUrl}/payments/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: opts.packName,
      amount: opts.amount,
      expiredAt: opts.expiredAt,
      extraData: { orderId: opts.orderId },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Mayar create payment failed with status ${response.status}: ${errorText}`,
    );
  }

  const data = (await response.json()) as MayarCreatePaymentResponse;

  if (!data.data?.id || !data.data?.link) {
    throw new Error(
      `Mayar create payment response is missing id or link: ${JSON.stringify(data)}`,
    );
  }

  return {
    id: data.data.id,
    transactionId: data.data.transactionId ?? null,
    link: data.data.link,
  };
}

/**
 * Fetches a transaction's authoritative status directly from Mayar.
 * Used both by the webhook handler (never trust the webhook payload alone)
 * and by the admin manual-verify route.
 */
export async function getMayarTransaction(
  transactionId: string,
): Promise<MayarTransactionDetail> {
  const { apiKey, baseUrl } = getCredentials();

  const response = await fetch(`${baseUrl}/transactions/${transactionId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Mayar get transaction failed with status ${response.status}: ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    data?: MayarTransactionDetail;
  };

  if (!data.data) {
    throw new Error(
      `Mayar transaction response is missing data for transactionId ${transactionId}`,
    );
  }

  return data.data;
}

/**
 * Verifies an incoming webhook request actually came from Mayar, using the
 * Webhook Token configured in the account dashboard (Integrasi -> API Keys
 * & Token). Mayar appends the token as a ?token= query parameter on the
 * webhook URL — confirmed against the sandbox account; see
 * docs/superpowers/plans/2026-07-29-mayar-spike-findings.md.
 */
export function verifyMayarWebhookRequest(request: Request): boolean {
  const expected = process.env.MAYAR_WEBHOOK_TOKEN;
  if (!expected) {
    throw new Error("Missing MAYAR_WEBHOOK_TOKEN in environment variables");
  }

  const token = new URL(request.url).searchParams.get("token");
  if (token === null) {
    return false;
  }
  // Plain comparison is sufficient: the query-param token is delivered over
  // HTTPS with network jitter that dwarfs any timing signal. timingSafeEqual
  // would require node:crypto which is browser-incompatible (this module is
  // also imported by client-side code for BOOSTER_PACKS).
  return token === expected;
}
