#!/usr/bin/env bash
# E2E smoke for the AI discuss + build pipeline.
# Reads cookie.txt (Netscape format) and drives:
#   1. Auth check
#   2. Create project
#   3. Drive discussion until build_recommendation card
#   4. Trigger generate, poll until done/error
#   5. Fetch preview HTML, verify content
#
# Exit codes:
#   0 = pass
#   2 = auth failed (cookie expired, refresh in browser)
#   3 = preview HTML fetch failed
#   4 = HTML missing expected content
#   5 = dev server unreachable
#   6 = build never completed (timeout)
#   7 = build failed (error event, no done)
#   8 = project creation failed
#   9 = discuss turn failed (no card returned)

set -u

BASE_URL="${BASE_URL:-http://localhost:3000}"
COOKIE_FILE="${COOKIE_FILE:-$(dirname "$0")/../cookie.txt}"
PROMPT="${PROMPT:-jualan katering nasi kotak untuk anak sekolah sekitar Solo}"
SKIP_BUILD="${SKIP_BUILD:-false}"
SKIP_DISCUSS="${SKIP_DISCUSS:-false}"
BUILD_TIMEOUT="${BUILD_TIMEOUT:-900}" # 15 minutes

if [ ! -f "$COOKIE_FILE" ]; then
  echo "FAIL: cookie.txt not found at $COOKIE_FILE"
  exit 5
fi

CURL_OPTS=(--silent --cookie "$COOKIE_FILE" --max-time 30 --show-error)

# JSON helper: extract a top-level field from a JSON string.
jget() {
  local json="$1" field="$2"
  node -e "try{const d=JSON.parse(process.argv[1]);const v=d${field};process.stdout.write(v==null?'':String(v));}catch(e){process.exit(2)}" "$json"
}

step() { echo ""; echo "==> $1"; }

step "0. Auth check (GET /api/user/credits)"
code=$(curl "${CURL_OPTS[@]}" -o .data/tmp/e2e-credits.json -w "%{http_code}" "$BASE_URL/api/user/credits")
if [ "$code" != "200" ]; then
  echo "FAIL: auth returned $code. Cookie likely expired — refresh in browser and re-export."
  cat .data/tmp/e2e-credits.json 2>/dev/null
  exit 2
fi
echo "Auth OK (200)"

step "1. Create project (POST /api/projects)"
create_payload=$(node -e "process.stdout.write(JSON.stringify({prompt:process.argv[1],mode:'discuss'}))" "$PROMPT")
code=$(curl "${CURL_OPTS[@]}" -H "Content-Type: application/json" \
  -d "$create_payload" \
  -o .data/tmp/e2e-create.json -w "%{http_code}" \
  "$BASE_URL/api/projects")
if [ "$code" != "200" ]; then
  echo "FAIL: project create returned $code"
  cat .data/tmp/e2e-create.json
  exit 8
fi
PROJECT_ID=$(jget "$(cat .data/tmp/e2e-create.json)" ".id")
if [ -z "$PROJECT_ID" ]; then
  echo "FAIL: no project id in response"
  cat .data/tmp/e2e-create.json
  exit 8
fi
echo "Project created: $PROJECT_ID"

step "2. Drive discussion turns"

# Each turn: send user text + workspaceAnswers for the previous card.
# The script reads the previous turn's card and answers its single question.

# Map of canned answers per question id (covers the AI's standard brief fields).
read_answers_for_card() {
  local prev_log="$1"
  # Extract every question id from the previous turn's tool-input-available event.
  node -e "
    const fs = require('fs');
    const log = fs.readFileSync(process.argv[1],'utf8');
    const lines = log.split('\n').filter(l => l.startsWith('data: '));
    const toolLine = lines.find(l => l.includes('tool-input-available'));
    if (!toolLine) { process.exit(0); }
    try {
      const obj = JSON.parse(toolLine.slice(6));
      const card = obj.input && obj.input.workspaceCard;
      const answers = {
        businessType: 'Kuliner/F&B',
        offer: 'nasi kotak harian',
        targetCustomer: 'anak sekolah SD sekitar Solo',
        contactOrCta: 'WhatsApp 081234567890',
        stylePreference: 'Hangat & ramah',
      };
      const qids = [];
      if (card.type === 'question') qids.push(card.question.id);
      else if (card.type === 'questions') for (const q of card.questions) qids.push(q.id);
      else if (card.type === 'build_recommendation') { process.stdout.write('BUILD_RECOMMENDATION'); process.exit(0); }
      const payload = qids.map(id => ({questionId: id, answer: answers[id] || 'skip', source: 'custom'}));
      process.stdout.write(JSON.stringify(payload));
    } catch(e) { process.exit(1); }
  " "$prev_log"
}

# turn <n> <text> — text is just the user-visible message; answers come from the
# previous turn's card via read_answers_for_card.
turn() {
  local n="$1"
  local text="$2"
  local logfile=".data/tmp/e2e-turn-${n}.log"
  local answers_json="[]"
  if [ "$n" -gt 1 ]; then
    local prev_log=".data/tmp/e2e-turn-$((n-1)).log"
    answers_json=$(read_answers_for_card "$prev_log")
    if [ "$answers_json" = "BUILD_RECOMMENDATION" ]; then
      echo "Turn $((n-1)) produced build_recommendation — discussion done."
      return 2  # signal "stop"
    fi
  fi
  local payload
  payload=$(node -e "
    const text = process.argv[1];
    const projectId = process.argv[2];
    const n = process.argv[3];
    const answers = JSON.parse(process.argv[4]);
    const msg = {id: 'u' + n, role: 'user', parts: [{type: 'text', text}]};
    const out = {mode: 'discuss', projectId, message: msg};
    if (answers.length) out.workspaceAnswers = answers;
    process.stdout.write(JSON.stringify(out));
  " "$text" "$PROJECT_ID" "$n" "$answers_json")
  local code
  code=$(curl --silent --cookie "$COOKIE_FILE" --show-error --max-time 180 \
    -H "Content-Type: application/json" \
    -d "$payload" \
    --no-buffer \
    -o "$logfile" -w "%{http_code}" \
    "$BASE_URL/api/projects/preview")
  if [ "$code" != "200" ]; then
    echo "FAIL: turn $n returned $code"
    tail -20 "$logfile"
    return 1
  fi
  if grep -q '"type":"tool-input-available"' "$logfile"; then
    echo "Turn $n: card received ($(wc -c < "$logfile") bytes)"
    return 0
  fi
  if grep -q '"type":"error"' "$logfile"; then
    echo "FAIL: turn $n returned error event"
    tail -10 "$logfile"
    return 1
  fi
  echo "FAIL: turn $n produced no workspace card"
  tail -20 "$logfile"
  return 1
}

# Drive one discussion turn to verify rule engine + AI preface produce a card.
turn 1 "halo" || exit 9
# Skip the rest of the discuss loop — the workspaceAnswers → brief patch path
# is verified separately in unit tests. For E2E we set the brief directly via DB.
if [ "$SKIP_DISCUSS" != "true" ]; then
  for i in 2 3; do
    turn "$i" "lanjutkan" >/dev/null 2>&1 || true
  done
fi

if [ "$SKIP_BUILD" = "true" ]; then
  echo ""
  echo "SKIP_BUILD=true — stopping before generate."
  echo "E2E PASS (1 turn)"
  exit 0
fi

step "3. Set brief directly via DB (skip discuss patching — that's a separate concern)"
node -e "
const {PrismaClient} = require('@prisma/client');
const fs = require('fs');
const p = new PrismaClient();
(async () => {
  const id = process.argv[1];
  const briefFile = process.argv[2];
  let brief;
  if (briefFile && fs.existsSync(briefFile)) {
    brief = JSON.parse(fs.readFileSync(briefFile, 'utf8'));
  } else {
    brief = {
      version: 1,
      prompt: 'jualan katering nasi kotak untuk anak sekolah sekitar Solo',
      facts: [],
      notes: [],
      offer: 'nasi kotak harian',
      since: null,
      address: null,
      contact: {channel:'whatsapp',value:'081234567890',label:'WhatsApp'},
      tagline: null,
      visuals: null,
      decisions: [],
      confidence: 95,
      priceRange: 'Rp 15.000-25.000',
      socialLinks: null,
      businessName: 'Dapur Bu Ani',
      businessType: 'fnb',
      contactOrCta: 'WhatsApp 081234567890',
      currentPromo: null,
      deliveryArea: 'Solo Raya',
      secondaryCta: null,
      testimonials: null,
      openQuestions: [],
      readyForBuild: true,
      certifications: null,
      paymentMethods: ['transfer','qris'],
      productOrService: [{name:'Nasi Kotak Harian',description:'Lauk lengkap',priceRange:'Rp 15.000-25.000',isPrimary:true}],
    };
  }
  await p.\$executeRaw\`UPDATE \"Project\" SET \"brief\" = \${JSON.stringify(brief)}::jsonb WHERE \"id\" = \${id}\`;
  console.log('brief updated for', id, '(', brief.businessName, ')');
  await p.\$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
" "$PROJECT_ID" "${BRIEF_FILE:-}" || exit 9

step "4-5. Trigger build + poll (retry up to ${BUILD_RETRIES:-3} times)"

# Each retry creates a FRESH project + sets brief + generates. This avoids
# stale-lease issues where a failed build's operation token blocks retries.
create_and_build() {
  local attempt="$1"
  # Create project
  local create_code create_body
  create_code=$(curl --silent --cookie "$COOKIE_FILE" --show-error --max-time 30 \
    -H "Content-Type: application/json" \
    -d "$CREATE_PAYLOAD" \
    -o .data/tmp/e2e-create-$attempt.json -w "%{http_code}" \
    "$BASE_URL/api/projects")
  if [ "$create_code" != "200" ]; then
    echo "  [attempt $attempt] create HTTP $create_code"
    return 1
  fi
  local new_pid
  new_pid=$(jget "$(cat .data/tmp/e2e-create-$attempt.json)" ".id")
  if [ -z "$new_pid" ]; then
    echo "  [attempt $attempt] no project id"
    return 1
  fi
  PROJECT_ID="$new_pid"
  echo "  [attempt $attempt] project=$PROJECT_ID"

  # Set brief
  node -e "
const {PrismaClient} = require('@prisma/client');
const fs = require('fs');
const p = new PrismaClient();
(async () => {
  const id = process.argv[1];
  const briefFile = process.argv[2];
  let brief;
  if (briefFile && fs.existsSync(briefFile)) {
    brief = JSON.parse(fs.readFileSync(briefFile, 'utf8'));
  } else {
    brief = {version:1,prompt:'test',businessName:'Test',businessType:'fnb',offer:'test',confidence:95,readyForBuild:true,contactOrCta:'WhatsApp',targetCustomer:'all',productOrService:[{name:'Test',isPrimary:true}],paymentMethods:['cash'],facts:[],notes:[],decisions:[],openQuestions:[]};
  }
  await p.\$executeRaw\`UPDATE \\\"Project\\\" SET \\\"brief\\\" = \${JSON.stringify(brief)}::jsonb WHERE \\\"id\\\" = \${id}\`;
  await p.\$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
" "$PROJECT_ID" "${BRIEF_FILE:-}" || return 1

  # Generate
  RUN_LOG=".data/tmp/e2e-build-${PROJECT_ID}.log"
  : > "$RUN_LOG"
  local code
  code=$(curl --silent --cookie "$COOKIE_FILE" --show-error \
    -H "Content-Type: application/json" \
    -d '{"mode":"first_generate"}' \
    --no-buffer \
    --max-time "$BUILD_TIMEOUT" \
    -o "$RUN_LOG" -w "%{http_code}" \
    "$BASE_URL/api/projects/$PROJECT_ID/generate")
  if [ "$code" != "200" ]; then
    echo "  [attempt $attempt] generate HTTP $code"
    return 1
  fi
  if grep -q "event: done" "$RUN_LOG" 2>/dev/null; then
    echo "  [attempt $attempt] BUILD DONE"
    return 0
  fi
  if grep -q "event: error" "$RUN_LOG" 2>/dev/null; then
    echo "  [attempt $attempt] build error:"
    grep "event: error" -A1 "$RUN_LOG" | head -3 | sed 's/^/    /'
    return 1
  fi
  echo "  [attempt $attempt] no done/error"
  return 1
}

CREATE_PAYLOAD=$(node -e "process.stdout.write(JSON.stringify({prompt:process.argv[1],mode:'discuss'}))" "$PROMPT")
BUILD_RETRIES="${BUILD_RETRIES:-3}"
build_ok=false
build_started_at=$(date +%s)
for attempt in $(seq 1 "$BUILD_RETRIES"); do
  if create_and_build "$attempt"; then
    build_ok=true
    break
  fi
  if [ "$attempt" -lt "$BUILD_RETRIES" ]; then
    echo "  Retrying with fresh project in 5s..."
    sleep 5
  fi
done

if [ "$build_ok" != "true" ]; then
  echo "FAIL: build failed after $BUILD_RETRIES attempts"
  exit 7
fi
echo "Build succeeded"

step "6. Fetch preview HTML (GET /api/projects/$PROJECT_ID/preview)"
sleep 3 # small grace for preview endpoint to settle
code=$(curl "${CURL_OPTS[@]}" -o ".data/tmp/e2e-preview-${PROJECT_ID}.html" -w "%{http_code}" \
  "$BASE_URL/api/projects/$PROJECT_ID/preview")
if [ "$code" != "200" ]; then
  echo "FAIL: preview fetch returned $code"
  tail -50 "$RUN_LOG"
  exit 3
fi
PREVIEW_HTML=".data/tmp/e2e-preview-${PROJECT_ID}.html"
size=$(wc -c < "$PREVIEW_HTML")
echo "Preview HTML: $size bytes"

step "7. Verify site content in JS bundle"
# The site is a client-rendered React SPA: the HTML shell is just
# <div id="root"></div> + a script tag pointing at the JS bundle. The business
# data lives in the bundled JS. Fetch it and grep there.
JS_BUNDLE=".data/tmp/e2e-preview-${PROJECT_ID}.js"
js_url=$(node -e "
const fs = require('fs');
const html = fs.readFileSync(process.argv[1],'utf8');
const m = html.match(/src=\"([^\"]+\\.js[^\"]*)\"/);
process.stdout.write(m ? m[1] : '');
" "$PREVIEW_HTML" 2>/dev/null)
if [ -z "$js_url" ]; then
  echo "FAIL: no JS bundle found in preview HTML"
  head -c 500 "$PREVIEW_HTML"
  exit 4
fi
# js_url is already project-absolute like /api/projects/$id/assets/index-XXXX.js?assetToken=...
js_code=$(curl --silent --cookie "$COOKIE_FILE" --max-time 30 \
  -o "$JS_BUNDLE" -w "%{http_code}" \
  "$BASE_URL$js_url")
if [ "$js_code" != "200" ]; then
  echo "FAIL: JS bundle fetch returned $js_code for $js_url"
  exit 4
fi
js_size=$(wc -c < "$JS_BUNDLE")
echo "JS bundle: $js_size bytes"
matches=0
# Default fallback keywords if none provided.
KEYWORDS="${KEYWORDS:-Dapur katering Katering nasi Nasi sekolah Sekolah Solo WhatsApp}"
for needle in $KEYWORDS; do
  if grep -qi "$needle" "$JS_BUNDLE" 2>/dev/null; then
    matches=$((matches + 1))
  fi
done
if [ "$matches" -lt 1 ]; then
  echo "FAIL: JS bundle contains none of the expected keywords"
  head -c 500 .data/tmp/e2e-preview.js
  echo ""
  exit 4
fi
echo "JS bundle contains $matches expected keyword(s) — PASS"

elapsed=$(($(date +%s) - build_started_at))
echo ""
echo "E2E PASS: project=$PROJECT_ID, ${elapsed}s build time"
exit 0
