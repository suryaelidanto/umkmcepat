export type PakasirPaymentMethod =
  | "qris"
  | "cimb_niaga_va"
  | "bni_va"
  | "sampoerna_va"
  | "bnc_va"
  | "maybank_va"
  | "permata_va"
  | "atm_bersama_va"
  | "artha_graha_va"
  | "bri_va";

export interface PakasirCreateTransactionPayload {
  project: string;
  order_id: string;
  amount: number;
  api_key: string;
}

export interface PakasirCreateTransactionResponse {
  payment?: {
    project: string;
    order_id: string;
    payment_number: string;
    expired_at?: string;
  };
  message?: string;
}

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
 * Creates a transaction in Pakasir.
 */
export async function createPakasirTransaction(opts: {
  orderId: string;
  amount: number;
  method?: PakasirPaymentMethod;
}): Promise<Required<PakasirCreateTransactionResponse>["payment"]> {
  const { apiKey, projectSlug } = getCredentials();
  const method = opts.method || "qris";
  const url = `${PAKASIR_BASE_URL}/transactioncreate/${method}`;

  const payload: PakasirCreateTransactionPayload = {
    project: projectSlug,
    order_id: opts.orderId,
    amount: opts.amount,
    api_key: apiKey,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Pakasir create transaction failed with status ${response.status}: ${errorText}`,
    );
  }

  const data = (await response.json()) as PakasirCreateTransactionResponse;

  if (!data.payment || !data.payment.payment_number) {
    throw new Error(
      `Pakasir API response is missing payment details: ${JSON.stringify(data)}`,
    );
  }

  return data.payment as Required<PakasirCreateTransactionResponse>["payment"];
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
