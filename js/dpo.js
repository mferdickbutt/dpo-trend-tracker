/**
 * Pure DPO (Days Payable Outstanding) analytics. Safe on zero purchases/COGS,
 * empty series, null inputs, and single-month series: never returns NaN or
 * Infinity (null instead).
 *
 * Formula: DPO = AP_ending / (purchases / days_in_period)
 *        = AP_ending × days_in_period / purchases
 *
 * `purchases` is the period denominator (purchases or COGS equivalent).
 * Higher DPO is favorable for cash (working-capital convention).
 *
 * Works in Node (CommonJS) and the browser (global `Dpo`).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.Dpo = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var FORMULA = "apEnding / (purchases / daysInPeriod)";
  var CATEGORIES = ["trade", "logistics", "services", "accrued", "other"];
  var CATEGORY_LABELS = {
    trade: "Trade payables",
    logistics: "Logistics",
    services: "Services",
    accrued: "Accrued",
    other: "Other",
  };
  var MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function asNumber(value) {
    if (value == null || value === "") return null;
    if (typeof value === "boolean") return null;
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
      var trimmed = value.trim();
      if (!trimmed) return null;
      var parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function finiteOrNull(value) {
    return isFiniteNumber(value) ? value : null;
  }

  /**
   * Calendar days in YYYY-MM. Uses UTC so timezone does not shift the month.
   */
  function daysInPeriod(monthKey) {
    if (typeof monthKey !== "string" || !/^\d{4}-\d{2}$/.test(monthKey)) {
      return null;
    }
    var parts = monthKey.split("-");
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    if (!isFiniteNumber(year) || !isFiniteNumber(month) || month < 1 || month > 12) {
      return null;
    }
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  /**
   * Purchases (preferred) or COGS equivalent. Null when missing/non-finite.
   */
  function purchasesOf(row) {
    if (row == null || typeof row !== "object") return null;
    var purchases = asNumber(row.purchases);
    if (purchases != null) return purchases;
    return asNumber(row.cogs);
  }

  /**
   * Sum of known payable-mix categories.
   * Missing/null categories are skipped. All-missing → null.
   * Explicit zeros sum to 0 (zero AP is a valid total).
   */
  function totalPayables(payables) {
    if (payables == null || typeof payables !== "object" || Array.isArray(payables)) {
      return null;
    }
    var sum = 0;
    var seen = false;
    for (var i = 0; i < CATEGORIES.length; i++) {
      var key = CATEGORIES[i];
      if (!Object.prototype.hasOwnProperty.call(payables, key)) continue;
      if (payables[key] == null || payables[key] === "") continue;
      var n = asNumber(payables[key]);
      if (n == null) return null;
      sum += n;
      seen = true;
    }
    return seen ? finiteOrNull(sum) : null;
  }

  /**
   * Per-month DPO. Returns null when the ratio is undefined
   * (zero/missing purchases or COGS, missing AP, non-positive days).
   */
  function computeDpo(apEnding, purchases, days) {
    var ap = asNumber(apEnding);
    var p = asNumber(purchases);
    var d = asNumber(days);
    if (ap == null || p == null || d == null) return null;
    if (p === 0 || d <= 0) return null;
    return finiteOrNull(ap / (p / d));
  }

  /**
   * Month-over-month change as a ratio: (current - previous) / previous.
   * Null when either side is null, previous is 0, or the series is a single month.
   */
  function monthOverMonth(current, previous) {
    var cur = asNumber(current);
    var prev = asNumber(previous);
    if (cur == null || prev == null || prev === 0) return null;
    return finiteOrNull((cur - prev) / prev);
  }

  /**
   * Absolute DPO change in days. Null on the same inputs as monthOverMonth.
   */
  function monthOverMonthDays(current, previous) {
    var cur = asNumber(current);
    var prev = asNumber(previous);
    if (cur == null || prev == null) return null;
    return finiteOrNull(cur - prev);
  }

  /**
   * Share of ending AP for each payable category (0–1).
   * When total is null or 0, every share is null.
   * Missing categories are 0 when total > 0.
   */
  function payableMix(payables, total) {
    var mix = {};
    var t = arguments.length > 1 ? asNumber(total) : totalPayables(payables);
    var invalid =
      payables == null ||
      typeof payables !== "object" ||
      Array.isArray(payables) ||
      t == null ||
      t === 0;
    if (invalid) {
      for (var i = 0; i < CATEGORIES.length; i++) mix[CATEGORIES[i]] = null;
      return mix;
    }
    for (var j = 0; j < CATEGORIES.length; j++) {
      var key = CATEGORIES[j];
      if (!Object.prototype.hasOwnProperty.call(payables, key) || payables[key] == null || payables[key] === "") {
        mix[key] = 0;
        continue;
      }
      var n = asNumber(payables[key]);
      mix[key] = n == null ? null : finiteOrNull(n / t);
    }
    return mix;
  }

  /**
   * Actual vs target: delta and delta as a share of target.
   * Null when actual/target is null or target is 0.
   * overTarget means actual > target (favorable for DPO / cash).
   */
  function compareToTarget(actual, target) {
    var a = asNumber(actual);
    var g = asNumber(target);
    if (a == null || g == null || g === 0) return null;
    var delta = a - g;
    var deltaPct = delta / g;
    if (!Number.isFinite(delta) || !Number.isFinite(deltaPct)) return null;
    return {
      actual: a,
      target: g,
      delta: delta,
      deltaPct: deltaPct,
      overTarget: a > g,
    };
  }

  function analyzeMonth(row, previousDpo, targets) {
    if (row == null || typeof row !== "object") return null;
    var key = typeof row.month === "string" ? row.month : null;
    var mixTotal = totalPayables(row.payables);
    var apEnding = asNumber(row.apEnding);
    if (apEnding == null) apEnding = mixTotal;
    var purchases = purchasesOf(row);
    var days =
      isFiniteNumber(asNumber(row.daysInPeriod)) && asNumber(row.daysInPeriod) > 0
        ? asNumber(row.daysInPeriod)
        : daysInPeriod(key);
    var dpo = computeDpo(apEnding, purchases, days);
    var mix = payableMix(row.payables, mixTotal != null ? mixTotal : apEnding);
    var mom = monthOverMonth(dpo, previousDpo);
    var momDays = monthOverMonthDays(dpo, previousDpo);
    var dpoTarget = null;
    var mixTargets = null;
    if (targets && typeof targets === "object") {
      if (targets.dpoDays != null) {
        dpoTarget = compareToTarget(dpo, targets.dpoDays);
      }
      if (targets.payableMix && typeof targets.payableMix === "object") {
        mixTargets = {};
        for (var i = 0; i < CATEGORIES.length; i++) {
          var cat = CATEGORIES[i];
          mixTargets[cat] = compareToTarget(mix[cat], targets.payableMix[cat]);
        }
      }
    }
    var vs = null;
    if (dpo != null && targets && asNumber(targets.dpoDays) != null) {
      if (dpo > targets.dpoDays) vs = "over";
      else if (dpo < targets.dpoDays) vs = "under";
      else vs = "on";
    }
    return {
      month: key,
      payables: row.payables && typeof row.payables === "object" ? row.payables : null,
      apEnding: apEnding,
      purchases: purchases,
      daysInPeriod: days,
      mix: mix,
      mixTotal: mixTotal,
      dpo: dpo,
      mom: mom,
      momDays: momDays,
      vsDpoTarget: dpoTarget,
      vsMixTarget: mixTargets,
      vsTarget: vs,
      aboveTarget: vs === "over",
      belowTarget: vs === "under",
      onTarget: vs === "on",
    };
  }

  /**
   * Analyze a full data document `{ meta, targets, months }`.
   * Empty/null series → `{ months: [], latest: null, mom: null, best: null, worst: null }`.
   * Single-month series → mom is null (no prior period).
   */
  function analyzeSeries(data) {
    var empty = {
      months: [],
      latest: null,
      previous: null,
      mom: null,
      best: null,
      worst: null,
      targets: null,
      currency: "USD",
      categories: CATEGORIES.slice(),
      formula: FORMULA,
      meta: null,
    };
    if (data == null || typeof data !== "object") return empty;
    var targets = data.targets && typeof data.targets === "object" ? data.targets : null;
    var rows = Array.isArray(data.months) ? data.months.filter(Boolean) : [];
    var sorted = rows.slice().sort(function (a, b) {
      return String((a && a.month) || "").localeCompare(String((b && b.month) || ""));
    });
    var months = [];
    var prevDpo = null;
    for (var i = 0; i < sorted.length; i++) {
      var analyzed = analyzeMonth(sorted[i], prevDpo, targets);
      if (analyzed) {
        months.push(analyzed);
        prevDpo = analyzed.dpo;
      }
    }
    var latest = months.length ? months[months.length - 1] : null;
    var previous = months.length > 1 ? months[months.length - 2] : null;
    var best = null;
    var worst = null;
    for (var j = 0; j < months.length; j++) {
      if (months[j].dpo == null) continue;
      if (best == null || months[j].dpo > best.dpo) best = months[j];
      if (worst == null || months[j].dpo < worst.dpo) worst = months[j];
    }
    return {
      months: months,
      latest: latest,
      previous: previous,
      mom: latest ? latest.mom : null,
      best: best,
      worst: worst,
      targets: targets,
      currency: (data.meta && data.meta.currency) || "USD",
      categories: CATEGORIES.slice(),
      formula: FORMULA,
      meta: data.meta || null,
    };
  }

  function monthLabel(iso) {
    if (iso == null || typeof iso !== "string") return "—";
    var parts = iso.split("-");
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    if (!year || month < 1 || month > 12) return iso;
    return MONTH_NAMES[month - 1] + " " + year;
  }

  function formatMoney(value) {
    if (!isFiniteNumber(value)) return "—";
    var abs = Math.abs(value);
    var formatted = abs.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
    return value < 0 ? "-" + formatted : formatted;
  }

  function formatPercent(ratio, signed, digits) {
    if (!isFiniteNumber(ratio)) return "—";
    var places = isFiniteNumber(digits) ? digits : 1;
    var pct = ratio * 100;
    var body = pct.toFixed(places) + "%";
    if (signed && pct > 0) return "+" + body;
    return body;
  }

  function formatDays(value, digits) {
    if (!isFiniteNumber(value)) return "—";
    var places = isFiniteNumber(digits) ? digits : 1;
    return value.toFixed(places);
  }

  function categoryLabel(key) {
    if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
    if (!key) return "—";
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  return {
    FORMULA: FORMULA,
    CATEGORIES: CATEGORIES,
    CATEGORY_LABELS: CATEGORY_LABELS,
    isFiniteNumber: isFiniteNumber,
    asNumber: asNumber,
    daysInPeriod: daysInPeriod,
    purchasesOf: purchasesOf,
    totalPayables: totalPayables,
    computeDpo: computeDpo,
    monthOverMonth: monthOverMonth,
    monthOverMonthDays: monthOverMonthDays,
    payableMix: payableMix,
    compareToTarget: compareToTarget,
    analyzeMonth: analyzeMonth,
    analyzeSeries: analyzeSeries,
    monthLabel: monthLabel,
    formatMoney: formatMoney,
    formatPercent: formatPercent,
    formatDays: formatDays,
    categoryLabel: categoryLabel,
  };
});
