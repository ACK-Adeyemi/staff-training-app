#!/usr/bin/env bash
# BP-5: Lighthouse on the staff home page, phone profile, three cold runs, medians printed.
# Not part of check.sh. Lighthouse is fetched with pnpm dlx at a pinned version; it is never a dependency.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

LH_VERSION="13.6.0"
URL="http://localhost:4173/staff-training-app/#/staff"
OUT=".agent-logs/lighthouse"
PID_FILE=/tmp/lh-preview.pid
RUNS=3
mkdir -p "$OUT"
rm -f "$OUT"/run-*.json

CHROME_PATH=$(ls -d /ms-playwright/chromium-*/chrome-linux64/chrome 2>/dev/null | sort -V | tail -1)
if [ -z "$CHROME_PATH" ]; then echo "Playwright Chromium not found in /ms-playwright" >&2; exit 1; fi
export CHROME_PATH

if [ ! -d apps/web/dist ]; then timeout 600 pnpm build >"$OUT/build.log" 2>&1 || { echo "build failed, see $OUT/build.log" >&2; exit 1; }; fi

timeout 900 pnpm --filter @sta/web preview --port 4173 --strictPort >"$OUT/preview.log" 2>&1 &
echo $! >"$PID_FILE"
stop() { kill "$(cat "$PID_FILE")" 2>/dev/null; }
trap stop EXIT

for _ in $(seq 1 30); do
  curl -fs -o /dev/null "$URL" && break
  sleep 1
done
curl -fs -o /dev/null "$URL" || { echo "preview did not start, see $OUT/preview.log" >&2; exit 1; }

for n in $(seq 1 "$RUNS"); do
  timeout 300 pnpm dlx "lighthouse@$LH_VERSION" "$URL" \
    --chrome-flags="--headless=new --no-sandbox --disable-gpu" \
    --only-categories=performance,accessibility,best-practices \
    --output=json --output-path="$OUT/run-$n.json" --quiet >"$OUT/run-$n.log" 2>&1 \
    || { echo "run $n failed, see $OUT/run-$n.log" >&2; exit 1; }
done

echo "Lighthouse $LH_VERSION, Chromium $CHROME_PATH, $RUNS cold runs, medians:"
jq -s '
  def med: sort | .[(length/2|floor)];
  def m(f): map(f) | med;
  {
    performance: m(.categories.performance.score),
    accessibility: m(.categories.accessibility.score),
    bestPractices: m(.categories["best-practices"].score),
    fcpMs: m(.audits["first-contentful-paint"].numericValue | round),
    lcpMs: m(.audits["largest-contentful-paint"].numericValue | round),
    tbtMs: m(.audits["total-blocking-time"].numericValue | round),
    cls: m(.audits["cumulative-layout-shift"].numericValue),
    speedIndexMs: m(.audits["speed-index"].numericValue | round),
    transferKB: m(.audits["total-byte-weight"].numericValue / 1024 | round)
  }' "$OUT"/run-*.json
