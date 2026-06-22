# 9Router AI gateway

UMKM Cepat sends AI requests through 9Router. The browser never calls AI providers directly.

```text
UMKM Cepat backend -> 9Router -> Command Code/provider -> model
```

## Start locally

```bash
docker compose --profile ai up -d 9router
docker compose ps 9router
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

If `docker` is not found, install/start Docker Desktop or Docker Engine first. If `20129` is busy, stop the other service using that port before starting 9Router.

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
host:20129 -> container:20128
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
