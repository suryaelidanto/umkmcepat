import { createHash, createHmac } from "node:crypto";

import { getEnv } from "@/lib/config";

export type R2Config = {
  accessKeyId: string;
  accountId: string;
  bucket: string;
  prefix: string;
  secretAccessKey: string;
};

export function getR2Config(opts: {
  bucket: "public" | "private";
  prefix: string;
}): R2Config {
  const bucketEnv =
    opts.bucket === "public" ? "R2_PUBLIC_BUCKET" : "R2_PRIVATE_BUCKET";
  return {
    accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
    accountId: requiredEnv("R2_ACCOUNT_ID"),
    bucket: requiredEnv(bucketEnv),
    prefix: opts.prefix.trim().replace(/^\/+|\/+$/g, ""),
    secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
  };
}

export function publicUrlFor(config: R2Config, key: string): string {
  const base = getEnv("R2_PUBLIC_BASE_URL");
  if (!base) {
    throw new Error(
      "R2_PUBLIC_BASE_URL is required for public display-media URLs. Enable public access on the bucket or keep the provider local.",
    );
  }
  return `${base.replace(/\/+$/, "")}/${config.prefix}/${key}`;
}

export async function signedR2Fetch(
  config: R2Config,
  key: string,
  input: {
    body?: Buffer;
    contentType?: string;
    method: "GET" | "PUT" | "DELETE";
  },
): Promise<Response> {
  const objectKey = config.prefix ? `${config.prefix}/${key}` : key;
  const encodedKey = objectKey
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const url = r2ObjectUrl(config, encodedKey);
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(input.body ?? Buffer.alloc(0));
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (input.contentType) {
    headers["content-type"] = input.contentType;
  }
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const canonicalRequest = [
    input.method,
    `/${config.bucket}/${encodedKey}`,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const signature = hmacHex(
    getSignatureKey(config.secretAccessKey, dateStamp),
    stringToSign,
  );
  return fetch(url, {
    body: input.body ? new Uint8Array(input.body) : undefined,
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    method: input.method,
  });
}

export function r2ObjectUrl(config: R2Config, encodedKey: string): string {
  return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${encodedKey}`;
}

function requiredEnv(name: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`${name} is required for R2 object storage.`);
  }
  return value;
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function getSignatureKey(secret: string, dateStamp: string) {
  const dateKey = hmac(`AWS4${secret}`, dateStamp);
  const dateRegionKey = hmac(dateKey, "auto");
  const dateRegionServiceKey = hmac(dateRegionKey, "s3");
  return hmac(dateRegionServiceKey, "aws4_request");
}
