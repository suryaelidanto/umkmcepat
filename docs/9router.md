# 9Router AI gateway

UMKM Cepat routes AI calls through a project-owned 9Router Docker container.

Flow:

```text
Frontend → UMKM Cepat backend → 9Router → Command Code/provider
```

Frontend must never call 9Router directly.

## Ports

9Router listens inside the container on `20128`.

Local development uses:

```text
Browser/dashboard: http://localhost:20129/dashboard
App API base:      http://localhost:20129/v1
Docker API base:   http://9router:20128/v1
```

The local Compose file publishes the container on host port `20130`, and `npm run 9router:local` exposes the stable developer URL `http://localhost:20129`.

Production Compose publishes `20129:20128` directly unless a reverse proxy replaces it.

## Local development

Start project infrastructure:

```bash
docker compose up -d postgres
docker compose --profile ai up -d 9router
npm run 9router:local
```

Open the dashboard:

```text
http://localhost:20129/dashboard
```

Default dashboard password:

```text
123456
```

Change the dashboard password when 9Router asks you to.

## Command Code provider

Add your Command Code provider/API key in 9Router:

```text
Providers → Command Code → Get API Key → paste key → save/test
```

Command Code key source:

```text
~/.commandcode/auth.json
```

or:

```text
commandcode.ai/studio
```

The Command Code key usually starts with:

```text
user_
```

## App API key

Create or copy a 9Router API key from the dashboard and put it in `.env`:

```env
AI_PROVIDER="9router"
AI_MODEL="cmc/deepseek/deepseek-v4-pro"
NINE_ROUTER_BASE_URL="http://localhost:20129/v1"
NINE_ROUTER_API_KEY="paste-9router-api-key-here"
NINE_ROUTER_MODEL="cmc/deepseek/deepseek-v4-pro"
```

## Model

Use one model only:

```text
cmc/deepseek/deepseek-v4-pro
```

## Production

`docker-compose.prod.yml` includes 9Router:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Inside production Compose, the app calls 9Router on the Docker network:

```env
NINE_ROUTER_BASE_URL="http://9router:20128/v1"
```

Public dashboard/API port:

```text
20129
```

9Router data persists in the `nine_router_data` Docker volume.

## Security notes

- Do not expose Command Code keys to the browser.
- Do not put provider keys in frontend env vars.
- Keep `NINE_ROUTER_API_KEY` in `.env` or deployment secrets only.
- 9Router stores provider configuration in its Docker volume.
- Put the production dashboard behind a firewall, VPN, or reverse proxy auth when exposed publicly.
