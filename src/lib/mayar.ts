import { getSetting } from "@/lib/app-settings";

export const BOOSTER_PACKS = {
  pocket: {
    amount: 2900,
    compareAtAmount: 15000,
    energy: 50000,
    name: "Pocket Booster",
  },
  starter: {
    amount: 8900,
    compareAtAmount: 45000,
    energy: 200000,
    name: "Starter Booster",
  },
  popular: {
    amount: 24900,
    compareAtAmount: 125000,
    energy: 600000,
    name: "Popular Booster",
  },
  max: {
    amount: 59900,
    compareAtAmount: 299000,
    energy: 1500000,
    name: "Max Booster",
  },
} as const;

export type BoosterPackId = keyof typeof BOOSTER_PACKS;

// Resolves pack pricing from AppSetting (DB-first). `amount` is charged;
// `compareAtAmount` is list price for discount display only (not billed).
// Client UI must not read BOOSTER_PACKS amounts directly — use listBoosterPacks.
export async function getBoosterPack(id: BoosterPackId) {
  const fallback = BOOSTER_PACKS[id];
  const [amount, energy, compareAtAmount] = await Promise.all([
    getSetting<number>(`booster.${id}.amount`, fallback.amount),
    getSetting<number>(`booster.${id}.energy`, fallback.energy),
    getSetting<number>(
      `booster.${id}.compare_at_amount`,
      fallback.compareAtAmount,
    ),
  ]);
  return { amount, compareAtAmount, energy, name: fallback.name };
}

export type BoosterPackResolved = {
  id: BoosterPackId;
  amount: number;
  compareAtAmount: number;
  discountPercent: number;
  energy: number;
  name: string;
};

export function discountPercentFromPrices(
  amount: number,
  compareAtAmount: number,
): number {
  if (
    !Number.isFinite(amount) ||
    !Number.isFinite(compareAtAmount) ||
    compareAtAmount <= amount ||
    compareAtAmount <= 0
  ) {
    return 0;
  }
  return Math.round(((compareAtAmount - amount) / compareAtAmount) * 100);
}

export async function listBoosterPacks(): Promise<BoosterPackResolved[]> {
  const ids = Object.keys(BOOSTER_PACKS) as BoosterPackId[];
  return Promise.all(
    ids.map(async (id) => {
      const pack = await getBoosterPack(id);
      return {
        id,
        amount: pack.amount,
        compareAtAmount: pack.compareAtAmount,
        discountPercent: discountPercentFromPrices(
          pack.amount,
          pack.compareAtAmount,
        ),
        energy: pack.energy,
        name: pack.name,
      };
    }),
  );
}

export interface MayarCreatePaymentResponse {
  statusCode: number;
  messages: string;
  data?: {
    id: string;
    transactionId: string;
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
 * Creates a single-use invoice in Mayar. Returns the hosted checkout link
 * and the transactionId (available at create time for invoices — used to
 * correlate the webhook that Mayar fires after payment).
 *
 * Uses /invoices/create (not /payments/create): invoices carry transactionId
 * at creation time and include it in the webhook payload, making reliable
 * order correlation possible.
 */
export async function createMayarPayment(opts: {
  orderId: string;
  amount: number;
  packName: string;
  expiredAt: string;
  customerName: string;
  customerEmail: string;
  customerMobile: string;
}): Promise<{ id: string; transactionId: string; link: string }> {
  const { apiKey, baseUrl } = getCredentials();

  const response = await fetch(`${baseUrl}/invoices/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: opts.customerName,
      email: opts.customerEmail,
      mobile: opts.customerMobile,
      amount: opts.amount,
      description: opts.orderId,
      expiredAt: opts.expiredAt,
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://umkmcepat.com"}/booster/success/${opts.orderId}`,
      items: [{ quantity: 1, rate: opts.amount, description: opts.packName }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Mayar create payment failed with status ${response.status}: ${errorText}`,
    );
  }

  const data = (await response.json()) as MayarCreatePaymentResponse;

  if (!data.data?.id || !data.data?.transactionId || !data.data?.link) {
    throw new Error(
      `Mayar create payment response is missing id, transactionId, or link: ${JSON.stringify(data)}`,
    );
  }

  return data.data;
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
