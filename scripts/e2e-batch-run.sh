#!/usr/bin/env bash
# Run e2e-build-smoke.sh for each variant under .data/tmp/briefs/.
# Cleans all non-permanent projects before each run (project limit is 5).
# Prints a summary table at the end.

set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BRIEFS_DIR="$PROJECT_DIR/.data/tmp/briefs"
PERMANENT_PROJECT_ID="cmrqkuz0q0001uf44bemoqz8c"  # Surya Thrift Store — keep

cleanup_projects() {
  node -e "
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
const keep = '${PERMANENT_PROJECT_ID}';
(async () => {
  const stale = await p.project.findMany({where:{NOT:{id:keep}},select:{id:true}});
  for (const s of stale) {
    try {
      await p.runtimeEvent.deleteMany({where:{projectId:s.id}});
      await p.projectDeployment.deleteMany({where:{projectId:s.id}});
      await p.projectBuild.deleteMany({where:{projectId:s.id}});
      await p.projectSnapshot.deleteMany({where:{projectId:s.id}});
      await p.projectEditAttempt.deleteMany({where:{projectId:s.id}});
      await p.project.delete({where:{id:s.id}});
    } catch(e) { console.error('delete failed', s.id, e.message); }
  }
  await p.\$disconnect();
})().catch(e => { console.error('cleanup error', e.message); process.exit(0); });
" 2>&1 || true
}

declare -a NAMES
declare -a RESULTS

cd "$PROJECT_DIR"

shopt -s nullglob
brief_files=( "$BRIEFS_DIR"/*.json )
total=${#brief_files[@]}
idx=0

for brief_file in "${brief_files[@]}"; do
  idx=$((idx + 1))
  name=$(basename "$brief_file" .json)
  keywords_file="$BRIEFS_DIR/$name.keywords"
  keywords=""
  if [ -f "$keywords_file" ]; then
    keywords=$(cat "$keywords_file" | tr -d '\n')
  fi
  prompt=$(node -e "try{const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(d.prompt || '');}catch(e){}" "$brief_file")

  echo ""
  echo "############################################################################"
  echo "# [$idx/$total] $name — prompt: \"$prompt\""
  echo "############################################################################"

  cleanup_projects
  echo "[cleanup] stale projects removed"

  start=$(date +%s)
  if PROMPT="$prompt" BRIEF_FILE="$brief_file" KEYWORDS="$keywords" \
     bash "$SCRIPT_DIR/e2e-build-smoke.sh" > "$BRIEFS_DIR/$name.run.log" 2>&1; then
    result="PASS"
  else
    result="FAIL(exit=$?)"
  fi
  end=$(date +%s)
  dur=$((end - start))

  NAMES+=("$name")
  RESULTS+=("$result (${dur}s)")

  # Show tail of run log for context
  tail -8 "$BRIEFS_DIR/$name.run.log"
done

echo ""
echo "============================================================================"
echo "E2E BATCH SUMMARY"
echo "============================================================================"
for i in "${!NAMES[@]}"; do
  printf "  %-20s %s\n" "${NAMES[$i]}" "${RESULTS[$i]}"
done
