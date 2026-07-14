#!/usr/bin/env bash
# Simulate a real user: create 10 projects, discuss in each, verify energy + limits.
set -uo pipefail

AUTHJS_SESSION=$(grep -v "^#" cookie.txt | grep "authjs.session-token" | awk '{print $7}')
COOKIE="authjs.session-token=$AUTHJS_SESSION"
BASE="http://localhost:3000"

PROMPTS=(
  "Landing page kedai kopi specialty Kopi Senja di Bandung, vibes hangat cozy"
  "Website jasa catering Aroma Dapur untuk acara pernikahan, elegan dan premium"
  "Portfolio fotografer Lensa Cahaya, minimalis dengan galeri foto"
  "Toko online kerajinan tangan Anyaman Nusantara, menampilkan produk tradisional"
  "Landing page les privat matemastika Bimbel Cerdas, ramah dan profesional"
  "Website klinik gigi Senyum Sehat, bersih modern dan terpercaya"
  "Promo event festival kuliner Nusantara Raya, meriah dan informatif"
  "Landing page aplikasi mobile dompet digital DompetKu, modern dan trustworthy"
  "Website studio desain grafis Pixel Kreatif, edgy dan creative"
  "Landing page jasa renovasi rumah Bangun Makmur, solid dan reliable"
)

echo "=== START SIMULATION: 10 projects ==="
echo "Energy BEFORE:"
curl -s -H "Cookie: $COOKIE" $BASE/api/user/credits
echo ""

CREATED=()
for i in "${!PROMPTS[@]}"; do
  NUM=$((i+1))
  PROMPT="${PROMPTS[$i]}"
  echo ""
  echo "----- PROJECT $NUM: ${PROMPT:0:50}... -----"
  RESP=$(curl -s -w "\n%{http_code}" -H "Cookie: $COOKIE" -H "Content-Type: application/json" \
    -X POST $BASE/api/projects \
    -d "{\"prompt\":\"$PROMPT\"}")
  HTTP=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  echo "  HTTP: $HTTP"
  PID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "  Project ID: $PID"
  if [ -n "$PID" ]; then
    CREATED+=("$PID")
  fi
done

echo ""
echo "=== Projects created: ${#CREATED[@]} ==="
echo "=== Project count + limit check ==="
curl -s -H "Cookie: $COOKIE" "$BASE/api/projects" | grep -o '"projectCount":[0-9]*\|"projectLimit":[0-9]*\|"overProjectLimit":[a-z]*'
echo ""
echo "=== Energy AFTER creating 10 projects ==="
curl -s -H "Cookie: $COOKIE" $BASE/api/user/credits
echo ""
