export function getRedisUrl(): string {
  const raw = process.env.REDIS_URL?.trim();
  return raw && raw.length > 0 ? raw : "redis://127.0.0.1:6379";
}
