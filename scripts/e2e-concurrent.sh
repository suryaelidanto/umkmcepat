#!/usr/bin/env bash
# Spawn 3 builds in parallel. No project deletion. No mid-loop cleanup.
# Each subshell creates its own project, sets a brief via DB, triggers build,
# and polls for done/error. Aggregates pass/fail at the end.

set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COOKIE_FILE="${COOKIE_FILE:-$PROJECT_DIR/cookie.txt}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
BRIEFS_DIR="$PROJECT_DIR/.data/tmp/briefs"
LOG_DIR="$PROJECT_DIR/.data/tmp"
mkdir -p "$LOG_DIR"

# Pick 3 briefs
BRIEFS=(
  "$BRIEFS_DIR/01-catering.json"
  "$BRIEFS_DIR/02-laundry.json"
  "$BRIEFS_DIR/03-design.json"
)
NAMES=(
  "catering"
  "laundry"
  "design"
)

# Common curl options (no --max-time for SSE)
CURL_OPTS=(--silent --cookie "$COOKIE_FILE" --show-error)

# Run one build end-to-end. Writes status to $LOG_DIR/concurrent-<name>.status
run_one() {
  local idx="$1"
  local name="$2"
  local brief_file="$3"
  local status_file="$LOG_DIR/concurrent-${name}.status"
  local sse_log="$LOG_DIR/concurrent-${name}.sse.log"
  local build_log="$LOG_DIR/concurrent-${name}.build.log"

  : > "$sse_log"
  : > "$build_log"

  echo "  [$name] create project"
  local create_payload
  create_payload=$(node -e "
const fs = require('fs');
const brief = JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
process.stdout.write(JSON.stringify({prompt: brief.prompt, mode: 'discuss'}));
" "$brief_file")
  local create_resp
  create_resp=$(curl "${CURL_OPTS[@]}" -H "Content-Type: application/json" \
    -d "$create_payload" --max-time 30 \
    "$BASE_URL/api/projects")
  local pid
  pid=$(node -e "
let d='';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => { try { console.log(JSON.parse(d).id || ''); } catch { console.log(''); } });
" <<< "$create_resp")
  if [ -z "$pid" ]; then
    echo "FAIL" > "$status_file"
    echo "  [$name] no project id from create"
    return
  fi
  echo "  [$name] project=$pid"

  # Set brief via DB
  node -e "
const {PrismaClient} = require('@prisma/client');
const fs = require('fs');
const p = new PrismaClient();
(async () => {
  const brief = JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
  await p.\$executeRaw\`UPDATE \\\"Project\\\" SET \\\"brief\\\" = \${JSON.stringify(brief)}::jsonb WHERE \\\"id\\\" = \${process.argv[2]}\`;
  await p.\$disconnect();
})();
" "$brief_file" "$pid"
  echo "  [$name] brief set"

  # Trigger build
  echo "  [$name] build started"
  curl "${CURL_OPTS[@]}" -H "Content-Type: application/json" \
    -d '{"mode":"first_generate"}' --max-time 700 --no-buffer \
    -o "$sse_log" -w "%{http_code}" \
    "$BASE_URL/api/projects/$pid/generate" > "$build_log" 2>&1
  local code
  code=$(cat "$build_log")
  echo "  [$name] curl exit=$code"

  if grep -q "event: done" "$sse_log" 2>/dev/null; then
    echo "PASS" > "$status_file"
    echo "  [$name] BUILD DONE"
  else
    echo "FAIL" > "$status_file"
    echo "  [$name] no done event:"
    grep "event: error" -A1 "$sse_log" 2>/dev/null | head -3 | sed 's/^/    /'
  fi

  # Save project id for later
  echo "$pid" > "$LOG_DIR/concurrent-${name}.pid"
}

cd "$PROJECT_DIR"

# Kick off all 3 in parallel
PIDS=()
for i in 0 1 2; do
  echo "=== Spawning ${NAMES[$i]} ==="
  run_one "$i" "${NAMES[$i]}" "${BRIEFS[$i]}" > "$LOG_DIR/concurrent-${NAMES[$i]}.out" 2>&1 &
  PIDS+=($!)
done

echo ""
echo "All 3 spawned. Waiting for completion (max 10 min)..."

# Wait for all
for p in "${PIDS[@]}"; do
  wait "$p" 2>/dev/null || true
done

echo ""
echo "============================================================================"
echo "CONCURRENT BUILD RESULTS"
echo "============================================================================"
for i in 0 1 2; do
  name="${NAMES[$i]}"
  status_file="$LOG_DIR/concurrent-${name}.status"
  status=$(cat "$status_file" 2>/dev/null || echo "UNKNOWN")
  pid_file="$LOG_DIR/concurrent-${name}.pid"
  pid=$(cat "$pid_file" 2>/dev/null || echo "n/a")
  printf "  %-12s %s (project=%s)\n" "$name" "$status" "$pid"
done

echo ""
echo "Projects in DB (newest 5):"
node -e "
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
p.project.findMany({orderBy:{createdAt:'desc'},take:5,select:{id:true,title:true,status:true,buildStatus:true}}).then(r => { console.log(JSON.stringify(r,null,2)); return p.\$disconnect(); });
" 2>&1
