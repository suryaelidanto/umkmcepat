# 9Router AI gateway

UMKM Cepat routes AI calls through a project-owned 9Router Docker container.

Flow:

```text
Frontend → UMKM Cepat backend → 9Router → Command Code/provider
```

Frontend must never call 9Router directly.

## Ports

9Router listens inside Docker on `20128`, but this project exposes it on host port `20129` to avoid conflicts with a personal local 9Router.

```text
Local dashboard: http://localhost:20129/dashboard
Local API:       http://localhost:20129/v1
Docker API:      http://9router:20128/v1
```

## Local development

Start project infra:

```bash
docker compose up -d postgres
docker compose --profile ai up -d 9router
npm run 9router:local
```

Open dashboard:

```text
http://localhost:20129/dashboard
```

`npm run 9router:local` keeps `localhost:20129` stable for local WSL Docker development. The 9Router container itself is still Docker-only and runs in the background.

Add Command Code provider/API key:

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

Then create/copy a 9Router API key from the 9Router dashboard and put it in `.env`:

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

Inside production compose, the app calls:

```env
NINE_ROUTER_BASE_URL="http://9router:20128/v1"
```

Public dashboard/API port remains:

```text
20129
```

9Router data persists in the `nine_router_data` Docker volume.

## Security notes

- Do not expose Command Code keys to the browser.
- Do not put provider keys in frontend env vars.
- Keep `NINE_ROUTER_API_KEY` in `.env` only.
- 9Router stores provider configuration in its Docker volume.
