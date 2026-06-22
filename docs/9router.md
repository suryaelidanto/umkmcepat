# 9Router AI gateway

UMKM Cepat sends AI requests through 9Router. The browser never calls AI providers directly.

```text
UMKM Cepat backend -> 9Router -> Headroom (optional compression) -> provider -> model
```

## Start locally

```bash
docker compose --profile ai up -d
docker compose ps 9router headroom
```

Open:

```text
http://localhost:20129
```

Default password:

```text
123456
```

Change it when prompted.

Headroom starts with the AI profile too.

Use this proxy URL in the project 9Router container's Compress context setup:

```text
http://headroom:8787
```

If you are configuring a native 9Router process on your host, use:

```text
http://localhost:8787
```

Health check:

```text
http://localhost:8787/health
```

If `docker` is not found, install/start Docker Desktop or Docker Engine first. If `20129` or `8787` is busy, stop the other service using that port before starting 9Router.

## Configure provider

1. Open 9Router dashboard.
2. Go to Providers.
3. Add Command Code provider.
4. Paste your Command Code API key.
5. Save and test.
6. Create or copy a 9Router API key.
7. Put it in `.env`:

```env
AI_PROVIDER="9router"
AI_MODELS="cmc/deepseek/deepseek-v4-pro,cmc/deepseek/deepseek-v4-flash,cmc/moonshotai/Kimi-K2.6"
NINE_ROUTER_BASE_URL="http://localhost:20129/v1"
NINE_ROUTER_API_KEY="paste-9router-api-key-here"
```

## Command Code key

Use either source:

```text
~/.commandcode/auth.json
```

or:

```text
https://commandcode.ai/studio
```

The key usually starts with:

```text
user_
```

## Models

Recommended local list:

```text
cmc/deepseek/deepseek-v4-pro
cmc/deepseek/deepseek-v4-flash
cmc/moonshotai/Kimi-K2.6
```

`AI_MODELS` is a comma-separated model picker list. The first model is used by default.

## Ports

Local Compose publishes:

```text
9Router:  host:20129 -> container:20128
Headroom: host:8787  -> container:8787
```

Use this locally:

```env
NINE_ROUTER_BASE_URL="http://localhost:20129/v1"
```

Production Compose can call the service by Docker DNS:

```env
NINE_ROUTER_BASE_URL="http://9router:20128/v1"
```

## Security

- Keep provider keys out of frontend env vars.
- Keep `NINE_ROUTER_API_KEY` in `.env` or deployment secrets.
- Do not commit `.env`.
- Protect the production dashboard with firewall, VPN, or reverse proxy auth.
