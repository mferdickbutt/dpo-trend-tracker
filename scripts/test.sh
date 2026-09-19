#!/usr/bin/env bash
# DPO tracker checks: pure math edge cases + static first-paint HTML.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0

pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "FAIL: $1"
  FAIL=$((FAIL + 1))
}

if ! command -v node >/dev/null 2>&1; then
  echo "FAIL: node is required"
  echo "Summary: 0 passed, 1 failed"
  exit 1
fi

MATH_OUT="$(node << 'NODE'
const fs = require("fs");
const Dpo = require("./js/dpo.js");

function isPoison(value) {
  if (typeof value === "number") return !Number.isFinite(value);
  if (value && typeof value === "object") {
    if (Array.isArray(value)) return value.some(isPoison);
    return Object.keys(value).some((k) => isPoison(value[k]));
  }
  return false;
}

function check(name, cond) {
  process.stdout.write((cond ? "PASS: " : "FAIL: ") + name + "\n");
}

check("DPO formula AP/(purchases/days) = 45", Dpo.computeDpo(3000000, 2000000, 30) === 45);
check("FORMULA mentions apEnding and purchases", Dpo.FORMULA.indexOf("apEnding") !== -1 && Dpo.FORMULA.indexOf("purchases") !== -1);

const zeroPurchases = Dpo.computeDpo(1000, 0, 30);
check("zero purchases returns null not NaN/Infinity", zeroPurchases === null && Number.isNaN(zeroPurchases) === false && zeroPurchases !== Infinity && zeroPurchases !== -Infinity);
check("zero COGS alias denominator returns null", Dpo.computeDpo(1000, Dpo.purchasesOf({ cogs: 0 }), 30) === null);
check("purchasesOf prefers purchases over cogs", Dpo.purchasesOf({ purchases: 10, cogs: 99 }) === 10);
check("purchasesOf falls back to cogs", Dpo.purchasesOf({ cogs: 50 }) === 50);

check("null AP returns null DPO", Dpo.computeDpo(null, 100, 30) === null);
check("null purchases returns null DPO", Dpo.computeDpo(100, null, 30) === null);
check("zero days returns null DPO", Dpo.computeDpo(100, 50, 0) === null);
check("Infinity AP returns null DPO", Dpo.computeDpo(Infinity, 50, 30) === null);
check("Infinity purchases returns null DPO", Dpo.computeDpo(100, Infinity, 30) === null);
check("zero AP vs positive purchases is 0", Dpo.computeDpo(0, 500, 30) === 0);

check("null input totalPayables returns null", Dpo.totalPayables(null) === null);
check("empty object totalPayables returns null", Dpo.totalPayables({}) === null);
check("zero AP mix total is 0 not null", Dpo.totalPayables({
  trade: 0, logistics: 0, services: 0, accrued: 0, other: 0
}) === 0);

const zeroMix = Dpo.payableMix({
  trade: 0, logistics: 0, services: 0, accrued: 0, other: 0
});
check("zero AP payable mix is null shares", Object.values(zeroMix).every((v) => v === null));

const single = Dpo.payableMix({ trade: 2500 });
check("single-category month mix is 100% trade", single.trade === 1);
check("single-category remaining categories are 0", single.logistics === 0 && single.services === 0 && single.accrued === 0 && single.other === 0);
check("single-category totalPayables equals the one category", Dpo.totalPayables({ trade: 2500 }) === 2500);

check("MoM with previous zero DPO returns null", Dpo.monthOverMonth(100, 0) === null);
check("MoM with null inputs returns null", Dpo.monthOverMonth(null, null) === null);
check("MoM 110 vs 100 is 0.1", Dpo.monthOverMonth(110, 100) === 0.1);
check("MoM days 50 vs 40 is 10", Dpo.monthOverMonthDays(50, 40) === 10);
check("MoM days with null prior is null", Dpo.monthOverMonthDays(40, null) === null);

const empty = Dpo.analyzeSeries({ months: [] });
check("empty series latest/best/worst/mom are null", empty.latest === null && empty.mom === null && empty.best === null && empty.worst === null && Array.isArray(empty.months) && empty.months.length === 0);
check("null series analyzeSeries returns empty months", Dpo.analyzeSeries(null).months.length === 0);
check("missing months array treated as empty", Dpo.analyzeSeries({}).months.length === 0);

const oneMonth = Dpo.analyzeSeries({
  targets: { dpoDays: 45 },
  months: [{ month: "2026-03", apEnding: 450, purchases: 310, daysInPeriod: 31 }]
});
check("single-month series MoM is null", oneMonth.months.length === 1 && oneMonth.mom === null && oneMonth.months[0].mom === null && oneMonth.previous === null);
check("single-month series never yields NaN or Infinity", !isPoison(oneMonth));
check("single-month series DPO is finite", Dpo.isFiniteNumber(oneMonth.latest && oneMonth.latest.dpo));

check("compareToTarget with zero target returns null", Dpo.compareToTarget(10, 0) === null);
check("compareToTarget 90 vs 100 is under by 10%", Dpo.compareToTarget(90, 100).overTarget === false && Dpo.compareToTarget(90, 100).deltaPct === -0.1);
check("compareToTarget 50 vs 45 is over", Dpo.compareToTarget(50, 45).overTarget === true);

check("daysInPeriod from YYYY-MM (Feb 2026 = 28)", Dpo.daysInPeriod("2026-02") === 28 && Dpo.daysInPeriod("2025-04") === 30 && Dpo.daysInPeriod("bad") === null);

const infGuard = Dpo.analyzeSeries({
  targets: { dpoDays: 0, payableMix: { trade: 0 } },
  months: [
    { month: "2026-01", apEnding: 1000, purchases: 0, daysInPeriod: 31, payables: { trade: 1000, logistics: 0, services: 0, accrued: 0, other: 0 } },
    { month: "2026-02", apEnding: null, purchases: null, payables: null },
    { month: "2026-03", apEnding: 0, purchases: 500, daysInPeriod: 31, payables: { trade: 0, logistics: 0, services: 0, accrued: 0, other: 0 } },
    { month: "2026-04", apEnding: 1000, cogs: 0, daysInPeriod: 30 }
  ]
});
check("zero/empty/null series never yields NaN or Infinity", !isPoison(infGuard));
check("zero-purchase denominator month DPO is null", infGuard.months[0] && infGuard.months[0].dpo === null);
check("zero-purchase month does not poison next MoM", infGuard.months[2] && infGuard.months[2].mom === null);
check("zero AP with positive purchases DPO is 0", infGuard.months[2] && infGuard.months[2].dpo === 0);
check("zero AP month mix shares are null", infGuard.months[2] && Object.values(infGuard.months[2].mix).every((v) => v === null));
check("zero COGS alias month DPO is null", infGuard.months[3] && infGuard.months[3].dpo === null);
check("null-input month DPO is null", infGuard.months[1] && infGuard.months[1].dpo === null);

const sample = JSON.parse(fs.readFileSync("./data/dpo.json", "utf8"));
const series = Dpo.analyzeSeries(sample);
check("sample series has 15–18 months", series.months.length >= 15 && series.months.length <= 18);
check("sample data is labeled as sample", sample.meta && (sample.meta.sample === true || /sample/i.test(sample.meta.note || "")));
check("sample includes DPO target(s)", sample.targets && Dpo.isFiniteNumber(sample.targets.dpoDays));
check("sample latest DPO is finite", Dpo.isFiniteNumber(series.latest && series.latest.dpo));
check("sample latest MoM is finite", Dpo.isFiniteNumber(series.latest && series.latest.mom));
check("sample latest payable mix sums to 1", Math.abs(Dpo.CATEGORIES.reduce((s, k) => s + series.latest.mix[k], 0) - 1) < 1e-9);
check("sample best is highest DPO and worst is lowest", series.best && series.worst && series.best.dpo >= series.worst.dpo);
check("sample months include purchases and AP", series.months.every((row) => Dpo.isFiniteNumber(row.apEnding) && Dpo.isFiniteNumber(row.purchases)));
check("sample first month is 2025-04 and last is 2026-09", series.months[0].month === "2025-04" && series.months[series.months.length - 1].month === "2026-09");
NODE
)"

printf '%s\n' "$MATH_OUT"
while IFS= read -r line; do
  case "$line" in
    PASS:*) PASS=$((PASS + 1)) ;;
    FAIL:*) FAIL=$((FAIL + 1)) ;;
  esac
done <<< "$MATH_OUT"

# --- Static first-paint HTML ---
if [[ ! -f "$ROOT/index.html" ]]; then
  fail "index.html exists for first paint"
else
  pass "index.html exists for first paint"
fi

HTML="$(cat "$ROOT/index.html")"

if grep -q -E 'Loading…|Loading\.\.\.|Loading\.\.|id="loading"' "$ROOT/index.html"; then
  fail "static HTML has no Loading shell"
else
  pass "static HTML has no Loading shell"
fi

echo "$HTML" | grep -q "DPO" && pass "static HTML includes DPO" || fail "static HTML includes DPO"
echo "$HTML" | grep -q "MoM change" && pass "static HTML includes MoM change" || fail "static HTML includes MoM change"
echo "$HTML" | grep -q "Payable mix" && pass "static HTML includes Payable mix" || fail "static HTML includes Payable mix"
echo "$HTML" | grep -q "Target comparisons" && pass "static HTML includes Target comparisons" || fail "static HTML includes Target comparisons"

ROW_COUNT="$(grep -c 'data-month="' "$ROOT/index.html" || true)"
if [[ "$ROW_COUNT" -ge 15 && "$ROW_COUNT" -le 18 ]]; then
  pass "static HTML has 15–18 month rows (${ROW_COUNT})"
else
  fail "static HTML has 15–18 month rows (found ${ROW_COUNT})"
fi

echo "$HTML" | grep -q 'data-month="2025-04"' && pass "static HTML includes first month 2025-04" || fail "static HTML includes first month 2025-04"
echo "$HTML" | grep -q 'data-month="2026-09"' && pass "static HTML includes last month 2026-09" || fail "static HTML includes last month 2026-09"

LATEST_DPO="$(node -e 'const D=require("./js/dpo.js");const d=require("./data/dpo.json");const s=D.analyzeSeries(d);process.stdout.write(D.formatDays(s.latest.dpo));')"
echo "$HTML" | grep -F -q "$LATEST_DPO" && pass "baked DPO value ${LATEST_DPO} is in HTML" || fail "baked DPO value ${LATEST_DPO} is in HTML"

# curl -sL against a static server (no JS execution)
PORT=8767
python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/dpo-http.log 2>&1 &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" >/dev/null 2>&1 || true; }
trap cleanup EXIT
sleep 0.4

CURL_HTML="$(curl -sL "http://127.0.0.1:${PORT}/")"
if [[ -z "$CURL_HTML" ]]; then
  fail "curl -sL returns HTML"
else
  pass "curl -sL returns HTML"
fi

echo "$CURL_HTML" | grep -q "DPO" && echo "$CURL_HTML" | grep -q "MoM change" && echo "$CURL_HTML" | grep -q "Payable mix" && echo "$CURL_HTML" | grep -q "Target comparisons" \
  && pass "curl -sL first paint includes DPO / MoM change / payable mix / target comparisons" \
  || fail "curl -sL first paint includes DPO / MoM change / payable mix / target comparisons"

CURL_ROWS="$(printf '%s\n' "$CURL_HTML" | grep -c 'data-month="' || true)"
if [[ "$CURL_ROWS" -ge 15 && "$CURL_ROWS" -le 18 ]]; then
  pass "curl -sL first paint includes ${CURL_ROWS} month rows"
else
  fail "curl -sL first paint includes 15–18 month rows (found ${CURL_ROWS})"
fi

if echo "$CURL_HTML" | grep -q -E 'Loading…|Loading\.\.\.|Loading\.\.|id="loading"'; then
  fail "curl -sL HTML has no Loading shell"
else
  pass "curl -sL HTML has no Loading shell"
fi

if [[ -f "$ROOT/.nojekyll" ]]; then
  pass ".nojekyll present for GitHub Pages"
else
  fail ".nojekyll present for GitHub Pages"
fi

if [[ -f "$ROOT/css/styles.css" ]]; then
  pass "minimal CSS stylesheet present"
else
  fail "minimal CSS stylesheet present"
fi

echo "Summary: ${PASS} passed, ${FAIL} failed"
if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
exit 0
