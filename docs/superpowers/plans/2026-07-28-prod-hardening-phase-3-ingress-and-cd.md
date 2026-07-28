# Production Hardening Phase 3: Cloudflare Tunnel Ingress and Working CD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CD pipeline actually build, push, and deploy — and put the VPS behind Cloudflare Tunnel with no inbound ports and Access-protected admin UIs.

**Architecture:** The current pipeline is broken in four independent ways (spec F2-F5), so Compose is fixed first to consume a registry image, then the workflow is fixed to produce and deploy one. Ingress lands after, because a tunnel pointing at a container that will not start is untestable. Deploys are pinned to immutable commit-SHA tags so rollback is a tag change rather than a rebuild.

**Tech Stack:** GitHub Actions, GHCR, Docker Compose, `cloudflared`, Cloudflare Access, systemd timers, Cloudflare R2.

**Spec:** `docs/superpowers/specs/2026-07-28-production-security-hardening-design.md` (§5 Phase 3)

**Depends on:** Phase 1 and Phase 2 complete and CI green. Phase 2's `/edit` SSE conversion is a hard prerequisite — Cloudflare terminates non-streaming requests at ~100 s and `/edit` previously ran to 600 s.

## Global Constraints

- **Never write real secret values into tracked files.** Env blocks in docs and `.env.example` use empty `""` values. Tunnel tokens, `APP_SECRET`, SSH keys, and R2 credentials live only in `.env` on the VPS or in GitHub Secrets.
- **Never echo secrets to logs.** To reference an env var in a workflow log, print its name and a set/unset boolean.
- GHCR image name is `ghcr.io/suryaelidanto/umkmcepat-app` (from `git remote -v`).
- Deploys use the **immutable `${{ github.sha }}` tag**. `latest` may be pushed as a convenience pointer but must never be what the VPS runs.
- Every GitHub Action must be pinned to a **full commit SHA** with a trailing version comment.
- The tunnel must not expose Postgres, the Docker socket, Headroom, or object-storage credentials.
- `.env` stays on the VPS. It is never transmitted through CI.
- Keep `workflow_dispatch` as the only trigger until a manual run has succeeded end-to-end.

---

### Task 1: Make production Compose consume a registry image

`docker-compose.prod.yml:3` declares `image: umkmcepat-app:local` with a `build:` block, so `docker compose pull app` resolves nothing and `up -d` rebuilds on the VPS — discarding the CI build entirely (spec F3). Umami has no `APP_SECRET` (F12), and the Postgres credential fallbacks mask misconfiguration (F13).

**Files:**
- Modify: `docker-compose.prod.yml`
- Modify: `.env.example`

**Interfaces:**
- Produces: `APP_IMAGE_TAG` env var, consumed by Task 4's deploy step. Defaults to `latest` for local use; CI always sets an explicit commit SHA.

- [ ] **Step 1: Point `app` and `migrate` at GHCR**

In `docker-compose.prod.yml`, replace the `app` service's image/build lines (3-6):

```yaml
    image: ghcr.io/suryaelidanto/umkmcepat-app:${APP_IMAGE_TAG:-latest}
```

Delete the `build:` block entirely. Apply the identical change to the `migrate` service (line 61), which must run the same image so migrations match the code.

- [ ] **Step 2: Give Umami a stable secret**

In the `umami` service environment, add:

```yaml
      APP_SECRET: ${UMAMI_APP_SECRET:?UMAMI_APP_SECRET is required}
```

Without it Umami generates a random secret per start, invalidating analytics sessions on every restart.

- [ ] **Step 3: Make bad credentials fail loudly**

Replace every `${POSTGRES_USER:-postgres}` with `${POSTGRES_USER:?POSTGRES_USER is required}` and every `${POSTGRES_PASSWORD:-postgres}` with `${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}`, in both the `postgres` service and the `DATABASE_URL` lines of `app` and `migrate`.

The application preflight already rejects `postgres`/`postgres` (`production-config.ts:104`), so the fallbacks only converted a clear configuration error into a crash loop.

Update the `umami` service's `DATABASE_URL` the same way — it currently hardcodes the `postgres` username.

- [ ] **Step 4: Add a healthcheck to Umami**

```yaml
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/api/heartbeat || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
```

- [ ] **Step 5: Document the new variables**

Add to `.env.example`, empty values only:

```env
# Production image tag (CI sets this to the deployed commit SHA).
APP_IMAGE_TAG=""
# Umami session secret (required in production; any long random string).
UMAMI_APP_SECRET=""
# Cloudflare Tunnel token (from the Zero Trust dashboard).
CLOUDFLARE_TUNNEL_TOKEN=""
```

- [ ] **Step 6: Verify the file still parses and resolves as expected**

Run: `docker compose -f docker-compose.prod.yml config --quiet`
Expected: fails with a clear message naming the missing required variables — that is the `:?` guard working. Then:

```bash
POSTGRES_USER=x POSTGRES_PASSWORD=y UMAMI_APP_SECRET=z \
  docker compose -f docker-compose.prod.yml config --quiet
```

Expected: exits 0.

- [ ] **Step 7: Confirm no `build:` remains**

Run: `grep -n "build:" docker-compose.prod.yml`
Expected: only the `headroom` service (line ~92), which is built locally by design.

- [ ] **Step 8: Commit**

```bash
git add docker-compose.prod.yml .env.example
git commit -m "fix(deploy): consume the GHCR image instead of rebuilding on the VPS

Compose referenced umkmcepat-app:local with a build block, so the CI-built
image was never deployed. Also adds Umami APP_SECRET and replaces silent
postgres/postgres fallbacks with required-variable guards."
```

---

### Task 2: Repair the deploy workflow

Four independent defects: the GHCR push lacks `packages: write` (F2), the deploy pulls the wrong image (F3), there is no SSH host key verification (F5), and no action is SHA-pinned (F5).

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Resolve the current SHA for each action**

```bash
for a in actions/checkout@v5 oven-sh/setup-bun@v2 docker/setup-qemu-action@v3 \
         docker/setup-buildx-action@v3 docker/login-action@v3 \
         docker/build-push-action@v6 appleboy/ssh-action@v1; do
  repo="${a%@*}"; ref="${a#*@}"
  echo "$a -> $(gh api "repos/$repo/git/ref/tags/$ref" --jq '.object.sha' 2>/dev/null)"
done
```

Record the output — Step 3 uses these values. If a tag resolves to a tag object rather than a commit, dereference it with `gh api repos/$repo/git/tags/<sha> --jq '.object.sha'`.

- [ ] **Step 2: Grant the package-write permission**

In `.github/workflows/deploy.yml`, change the workflow-level block (lines 21-22) to keep `contents: read` and add a job-level override on `build-and-push`:

```yaml
    permissions:
      contents: read
      packages: write
```

Scope it to the job rather than the workflow so the `deploy` job keeps least privilege.

- [ ] **Step 3: Pin every action to its SHA**

Replace each `uses:` line with the SHA from Step 1, keeping the version as a comment:

```yaml
      - uses: actions/checkout@<sha>  # v5
```

Apply to all seven actions across both jobs.

- [ ] **Step 4: Tag the image with the commit SHA as the primary reference**

The `tags:` block already emits both `:latest` and `:${{ github.sha }}`. Leave it, but add an output so the deploy job consumes the immutable one:

```yaml
      - name: Export deployed tag
        id: meta
        run: echo "tag=${{ github.sha }}" >> "$GITHUB_OUTPUT"
```

and declare on the job:

```yaml
    outputs:
      tag: ${{ steps.meta.outputs.tag }}
```

- [ ] **Step 5: Verify the host key and deploy the immutable tag**

Replace the `deploy` job's SSH step:

```yaml
      - name: SSH deploy
        uses: appleboy/ssh-action@<sha>  # v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          fingerprint: ${{ secrets.DEPLOY_SSH_FINGERPRINT }}
          envs: APP_IMAGE_TAG
          script: |
            set -euo pipefail
            cd "${{ secrets.DEPLOY_PATH }}"

            # Record what is running now so Step 6 can roll back to it.
            PREVIOUS_TAG="$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' umkmcepat-app 2>/dev/null || echo '')"
            echo "previous_tag=${PREVIOUS_TAG:-none}"

            export APP_IMAGE_TAG
            docker compose -f docker-compose.prod.yml pull app migrate
            docker compose -f docker-compose.prod.yml up -d

            # Gate on readiness; roll back if the new image cannot serve.
            for i in $(seq 1 30); do
              if curl -fsS http://127.0.0.1:3000/api/health/ready >/dev/null; then
                echo "ready"
                docker image prune -f
                exit 0
              fi
              sleep 5
            done

            echo "readiness check failed; rolling back"
            if [ -n "$PREVIOUS_TAG" ]; then
              APP_IMAGE_TAG="$PREVIOUS_TAG" docker compose -f docker-compose.prod.yml up -d
            fi
            exit 1
        env:
          APP_IMAGE_TAG: ${{ needs.build-and-push.outputs.tag }}
```

- [ ] **Step 6: Label the image so rollback can read the previous revision**

The rollback above reads an OCI revision label. Add it to the build step:

```yaml
          labels: |
            org.opencontainers.image.revision=${{ github.sha }}
```

- [ ] **Step 7: Validate the workflow syntax**

Run: `gh workflow view deploy.yml`
Expected: parses without error. If `actionlint` is available, run it too.

- [ ] **Step 8: Confirm no secret is echoed**

Run: `grep -nE "echo .*(SECRET|TOKEN|KEY|PASSWORD)" .github/workflows/deploy.yml`
Expected: no output. The only `echo` of a secret-adjacent value is the image tag, which is a public commit SHA.

- [ ] **Step 9: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "fix(ci): make the deploy workflow able to push and deploy

Adds packages: write (the GHCR push would have 403'd), pins every action
to a commit SHA, verifies the SSH host key, deploys the immutable commit
SHA tag rather than latest, and gates on /api/health/ready with rollback."
```

---

### Task 3: Add Cloudflare Tunnel ingress

Chosen over Caddy/nginx because the project is already on Cloudflare (R2, `media.umkmcepat.com`), it requires no inbound ports — composing with the existing loopback-only bindings — and Cloudflare Access supplies the auth layer 9Router, Umami, and Uptime Kuma currently lack.

**Files:**
- Modify: `docker-compose.prod.yml`
- Modify: `docs/deployment.md`

- [ ] **Step 1: Create the tunnel in the Cloudflare dashboard**

In Zero Trust → Networks → Tunnels, create a tunnel named `umkmcepat-prod` and copy its token. Put it in the VPS `.env` as `CLOUDFLARE_TUNNEL_TOKEN`. **Do not paste it into any tracked file or into this plan.**

- [ ] **Step 2: Add the cloudflared service**

Append to `docker-compose.prod.yml` services:

```yaml
  # Ingress. No inbound ports are opened on the host; cloudflared dials out to
  # Cloudflare and traffic arrives over that connection. Every other service
  # stays bound to 127.0.0.1.
  cloudflared:
    image: docker.io/cloudflare/cloudflared:latest
    container_name: umkmcepat-cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN:?CLOUDFLARE_TUNNEL_TOKEN is required}
    depends_on:
      app:
        condition: service_healthy
```

- [ ] **Step 3: Configure public hostname routing in the dashboard**

Add one public hostname, pointing at the container over the Compose network:

| Hostname | Service |
| --- | --- |
| `umkmcepat.com` | `http://app:3000` |

Do **not** add hostnames for Postgres, Headroom, or 9Router's internal port here.

- [ ] **Step 4: Verify the app is reachable and no ports are exposed**

On the VPS:

```bash
docker compose -f docker-compose.prod.yml up -d cloudflared
ss -tlnp | grep -vE "127\.0\.0\.1|::1" | grep -E ":(80|443|3000|5432)" || echo "no public listeners"
```

Expected: `no public listeners`. Then load `https://umkmcepat.com` in a browser — it should serve the app.

- [ ] **Step 5: Verify OAuth survives the proxy**

`src/lib/auth-config.ts:94` sets `trustHost: true`, so the origin must receive the canonical public host (spec F17).

Sign in with Google at `https://umkmcepat.com`.

Expected: the callback returns to `https://umkmcepat.com`, not an internal hostname, and the session persists. If the callback URL is wrong, confirm `NEXTAUTH_URL` is set to the public origin in the VPS `.env` — Auth.js prefers it over the forwarded host.

- [ ] **Step 6: Verify streaming works through the tunnel**

This is the specific reason Phase 2 was a prerequisite.

Open a project, submit a visual comment, and let the edit run past 100 seconds.

Expected: progress events keep arriving and the edit completes. A `524` at ~100 s means the response is not actually streaming — recheck Phase 2 Task 5 Step 7.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.prod.yml
git commit -m "feat(deploy): add Cloudflare Tunnel ingress

No inbound ports on the host; cloudflared dials out. Requires the Phase 2
streaming /edit conversion, since Cloudflare terminates non-streaming
requests at ~100s."
```

---

### Task 4: Put the admin interfaces behind Cloudflare Access

9Router, Umami, and Uptime Kuma currently have no authentication beyond loopback binding. `docs/deployment.md:67` already anticipates protected access for the 9Router dashboard.

**Files:**
- Modify: `docs/deployment.md`

- [ ] **Step 1: Add Access-protected hostnames**

In the tunnel's public hostname configuration, add:

| Hostname | Service |
| --- | --- |
| `9router.umkmcepat.com` | `http://9router:20128` |
| `umami.umkmcepat.com` | `http://umami:3000` |
| `status.umkmcepat.com` | `http://uptime-kuma:3001` |

- [ ] **Step 2: Create an Access application for each**

In Zero Trust → Access → Applications, add a self-hosted application per hostname with a policy allowing only your own email address.

- [ ] **Step 3: Verify each is actually protected**

For each hostname, open it in a private browsing window.

Expected: a Cloudflare Access login prompt, **not** the application. Reaching any dashboard without authenticating means the policy is not attached — fix before continuing.

- [ ] **Step 4: Confirm the loopback bindings are still in place**

Run: `grep -n "127.0.0.1" docker-compose.prod.yml`
Expected: `app`, `9router`, `umami`, and `uptime-kuma` all still bind to loopback. Access is defense in depth, not a replacement for the binding.

- [ ] **Step 5: Document it**

In `docs/deployment.md`, replace the "Preferred ingress" block with the Cloudflare Tunnel topology, listing which hostnames are public and which are Access-protected.

- [ ] **Step 6: Commit**

```bash
git add docs/deployment.md
git commit -m "docs(deploy): document Cloudflare Access for admin interfaces"
```

---

### Task 5: Schedule backups and copy them off the host

`scripts/backup-db.sh` is correct but runs nowhere, is referenced by no documentation, and writes only to local disk — so losing the host loses the backups (spec F15).

**Files:**
- Modify: `scripts/backup-db.sh`
- Create: `docker/systemd/umkmcepat-backup.service`
- Create: `docker/systemd/umkmcepat-backup.timer`
- Modify: `docs/deployment.md`

- [ ] **Step 1: Upload each dump to R2**

Append to `scripts/backup-db.sh`, before the final echo:

```bash
# Copy off-host. A backup that only exists on the machine being backed up is
# not a backup. Uses the same private bucket as project artifacts.
if [ -n "${S3_PRIVATE_BUCKET:-}" ]; then
  echo "[backup] Uploading to object storage..."
  aws s3 cp "${BACKUP_DIR}/${FILENAME}.gz" \
    "s3://${S3_PRIVATE_BUCKET}/db-backups/${FILENAME}.gz" \
    --endpoint-url "https://${S3_ACCOUNT_ID}.r2.cloudflarestorage.com"
else
  echo "[backup] S3_PRIVATE_BUCKET unset; keeping local copy only."
fi
```

- [ ] **Step 2: Create the systemd service unit**

Create `docker/systemd/umkmcepat-backup.service`:

```ini
[Unit]
Description=UMKM Cepat database backup
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=/opt/umkmcepat
EnvironmentFile=/opt/umkmcepat/.env
ExecStart=/opt/umkmcepat/scripts/backup-db.sh
```

- [ ] **Step 3: Create the timer unit**

Create `docker/systemd/umkmcepat-backup.timer`:

```ini
[Unit]
Description=Run the UMKM Cepat database backup daily

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

`Persistent=true` runs a missed backup after downtime rather than skipping the day.

- [ ] **Step 4: Install and start on the VPS**

```bash
sudo cp docker/systemd/umkmcepat-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now umkmcepat-backup.timer
systemctl list-timers umkmcepat-backup.timer
```

Expected: the timer is listed with a next-run time.

- [ ] **Step 5: Run one backup immediately and confirm it lands in R2**

```bash
sudo systemctl start umkmcepat-backup.service
journalctl -u umkmcepat-backup.service -n 20 --no-pager
```

Expected: "Backup completed successfully" with no error from the upload step. Confirm the object exists in the R2 bucket under `db-backups/`.

- [ ] **Step 6: Actually restore it — an untested backup is not a backup**

```bash
gunzip -c /backups/umkmcepat-<timestamp>.sql.gz | \
  docker exec -i umkmcepat-postgres psql -U "$POSTGRES_USER" -d umkmcepat_restore_test
```

Create the scratch database first, restore into it, confirm a table has rows, then drop it. Expected: restore completes without error.

- [ ] **Step 7: Document the schedule and the restore procedure**

Add a "Backups" section to `docs/deployment.md` covering the timer, the R2 location, the 7-day local retention, and the restore command from Step 6.

- [ ] **Step 8: Commit**

```bash
git add scripts/backup-db.sh docker/systemd docs/deployment.md
git commit -m "feat(ops): schedule daily backups with an off-host copy to R2"
```

---

### Task 6: First real deployment

**Files:** none — this is an execution and verification task.

- [ ] **Step 1: Confirm the required GitHub Secrets exist**

Run: `gh secret list`
Expected: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_SSH_FINGERPRINT`, `DEPLOY_PATH`. Add any that are missing.

Obtain the fingerprint with `ssh-keyscan -t ed25519 <host> | ssh-keygen -lf -`.

- [ ] **Step 2: Confirm the VPS `.env` is complete**

On the VPS, verify every variable in the spec's minimum production env is set, plus `APP_IMAGE_TAG`, `UMAMI_APP_SECRET`, and `CLOUDFLARE_TUNNEL_TOKEN`.

Check names and set/unset status only — **never print values**:

```bash
while read -r k; do
  [ -n "$k" ] && printf '%s=%s\n' "$k" "$([ -n "${!k:-}" ] && echo set || echo UNSET)"
done < <(grep -oE '^[A-Z_]+' /opt/umkmcepat/.env | sort -u)
```

Expected: no `UNSET` among required variables.

- [ ] **Step 3: Trigger the deployment**

```bash
gh workflow run deploy.yml -f ref=dev
gh run watch
```

Expected: both jobs succeed. The build job pushing successfully confirms the `packages: write` fix; the deploy job's `ready` output confirms the health gate.

- [ ] **Step 4: Verify the running image is exactly what CI built**

On the VPS:

```bash
docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' umkmcepat-app
```

Expected: matches the deployed commit SHA. This is the check that proves F3 is fixed — previously the VPS ran a locally rebuilt image.

- [ ] **Step 5: Verify the app is healthy and public**

```bash
curl -fsS https://umkmcepat.com/api/health/ready && echo OK
```

Expected: `OK`.

- [ ] **Step 6: Exercise rollback deliberately**

Rollback is worthless untested. On the VPS:

```bash
APP_IMAGE_TAG=<previous-sha> docker compose -f docker-compose.prod.yml up -d
docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' umkmcepat-app
```

Expected: reports the previous SHA and the app still serves. Then roll forward again to the current SHA.

- [ ] **Step 7: Enable automatic deploys on main**

Only now that a manual run has succeeded end-to-end. In `.github/workflows/deploy.yml`, replace the commented-out trigger block (lines 10-12) with a live one:

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      ref:
        description: "Git ref (branch/tag/sha) to deploy"
        required: false
        default: "main"
```

Delete the stale "BACKUP / DISABLED" comment block (lines 3-9), which no longer describes reality.

- [ ] **Step 8: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: enable automatic deploys on main after a verified manual run"
```

---

### Task 7: Phase gate

- [ ] **Step 1: Full gate**

Run: `bun run verify && bun run test:integration`
Expected: PASS.

- [ ] **Step 2: Walk the success criteria**

Confirm each item in spec §9 is satisfied. Anything unmet is a task that has not actually finished.

- [ ] **Step 3: Confirm nothing is publicly exposed that should not be**

On the VPS:

```bash
ss -tlnp | grep -vE "127\.0\.0\.1|::1" || echo "no public listeners"
```

Expected: `no public listeners`. Postgres, Headroom, and the Docker socket must not be reachable from outside.

- [ ] **Step 4: Confirm no secret reached a tracked file**

```bash
git grep -nEI "(sk-[A-Za-z0-9]{16,}|re_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{12,}|eyJ[A-Za-z0-9_-]{20,})" -- . ':!bun.lock' || echo "clean"
```

Expected: `clean`.

- [ ] **Step 5: Final documentation sync**

- `docs/deployment.md` — tunnel topology, GHCR image flow, `APP_IMAGE_TAG` rollback procedure, backup schedule and restore, and the ~100 s streaming constraint on any future endpoint.
- `docs/architecture.md` — ingress boundary is now Cloudflare Tunnel.
- `CHANGELOG.md` — deployment and ingress changes.

- [ ] **Step 6: Commit and push**

```bash
git add docs/deployment.md docs/architecture.md CHANGELOG.md
git commit -m "docs: phase 3 ingress and deployment"
git push origin dev
```
