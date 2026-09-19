#!/usr/bin/env node
/**
 * Bake DPO summary metrics and the monthly table into index.html.
 * First paint does not require JavaScript.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Dpo = require("../js/dpo.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "data", "dpo.json");
const OUT_PATH = path.join(ROOT, "index.html");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attr(value) {
  return value == null || !Number.isFinite(Number(value)) ? "" : String(value);
}

function toneClass(value) {
  if (!Dpo.isFiniteNumber(value) || value === 0) return "";
  return value > 0 ? "up good" : "down warn";
}

function targetCopy(comparison, unit) {
  if (!comparison) return "No target comparison (missing actual or target).";
  if (comparison.delta === 0) {
    return '<span class="good">on target</span>';
  }
  const verb = comparison.overTarget ? "over" : "under";
  const cls = comparison.overTarget ? "good" : "warn";
  const relative = Dpo.formatPercent(Math.abs(comparison.deltaPct), false, 1);
  if (unit === "days") {
    return (
      '<span class="' +
      cls +
      '">' +
      verb +
      " target by " +
      Dpo.formatDays(Math.abs(comparison.delta), 1) +
      " days (" +
      relative +
      ")</span>"
    );
  }
  return (
    '<span class="' +
    cls +
    '">' +
    verb +
    " target by " +
    Dpo.formatPercent(Math.abs(comparison.delta), false, 1) +
    " pts (" +
    relative +
    " relative)</span>"
  );
}

function pill(comparison) {
  if (!comparison) return '<span class="pill">—</span>';
  if (comparison.delta === 0) return '<span class="pill on">On target</span>';
  const cls = comparison.overTarget ? "over" : "under";
  const label = comparison.overTarget ? "Over" : "Under";
  return (
    '<span class="pill ' +
    cls +
    '">' +
    label +
    " " +
    Dpo.formatPercent(Math.abs(comparison.deltaPct), false, 1) +
    "</span>"
  );
}

function mixRows(latest) {
  return Dpo.CATEGORIES.map(function (key) {
    if (!latest) {
      return (
        '<div class="mix-row"><div>' +
        escapeHtml(Dpo.categoryLabel(key)) +
        '</div><div class="mix-bar"><span style="width:0%"></span></div><div>—</div><div class="sub">—</div></div>'
      );
    }
    const share = latest.mix[key];
    const width = Dpo.isFiniteNumber(share) ? Math.max(0, Math.min(100, share * 100)).toFixed(1) : "0";
    const vs = latest.vsMixTarget ? latest.vsMixTarget[key] : null;
    const vsText = vs
      ? vs.delta === 0
        ? "on mix target"
        : (vs.overTarget ? "over" : "under") + " mix target " + Dpo.formatPercent(Math.abs(vs.delta), false, 1) + " pts"
      : "no mix target";
    return (
      '<div class="mix-row"><div>' +
      escapeHtml(Dpo.categoryLabel(key)) +
      '</div><div class="mix-bar" title="' +
      escapeHtml(Dpo.formatPercent(share, false, 1)) +
      '"><span style="width:' +
      width +
      '%"></span></div><div>' +
      Dpo.formatPercent(share, false, 1) +
      '</div><div class="sub">' +
      escapeHtml(vsText) +
      "</div></div>"
    );
  }).join("");
}

function sparkBars(months) {
  const values = months.map(function (row) {
    return Dpo.isFiniteNumber(row.dpo) ? row.dpo : 0;
  });
  const max = values.reduce(function (acc, n) {
    return n > acc ? n : acc;
  }, 0);
  return months
    .map(function (row, index) {
      const height = max > 0 && Dpo.isFiniteNumber(row.dpo) ? (row.dpo / max) * 100 : 0;
      const latest = index === months.length - 1 ? " is-latest" : "";
      return (
        '<div class="bar' +
        latest +
        '" style="height:' +
        height.toFixed(1) +
        '%" title="' +
        escapeHtml(Dpo.monthLabel(row.month) + " " + Dpo.formatDays(row.dpo) + " days") +
        '"></div>'
      );
    })
    .join("");
}

function monthRows(months) {
  return months
    .map(function (row) {
      const payables = row.payables || {};
      const cells = Dpo.CATEGORIES.map(function (key) {
        const n = Dpo.asNumber(payables[key]);
        return (
          '<td data-key="' +
          key +
          '" data-value="' +
          attr(n) +
          '">' +
          Dpo.formatMoney(n) +
          "</td>"
        );
      }).join("");
      return (
        '<tr data-month="' +
        escapeHtml(row.month || "") +
        '" data-label="' +
        escapeHtml(Dpo.monthLabel(row.month)) +
        '" data-total="' +
        escapeHtml(Dpo.formatDays(row.dpo) + " days") +
        '">' +
        '<td data-key="month" data-value="' +
        escapeHtml(row.month || "") +
        '">' +
        escapeHtml(Dpo.monthLabel(row.month)) +
        "</td>" +
        cells +
        '<td data-key="apEnding" data-value="' +
        attr(row.apEnding) +
        '">' +
        Dpo.formatMoney(row.apEnding) +
        "</td>" +
        '<td data-key="purchases" data-value="' +
        attr(row.purchases) +
        '">' +
        Dpo.formatMoney(row.purchases) +
        "</td>" +
        '<td data-key="days" data-value="' +
        attr(row.daysInPeriod) +
        '">' +
        (row.daysInPeriod != null ? String(row.daysInPeriod) : "—") +
        "</td>" +
        '<td data-key="dpo" data-value="' +
        attr(row.dpo) +
        '">' +
        Dpo.formatDays(row.dpo) +
        "</td>" +
        '<td data-key="mom" data-value="' +
        attr(row.mom) +
        '">' +
        Dpo.formatPercent(row.mom, true, 1) +
        "</td>" +
        '<td data-key="target">' +
        pill(row.vsDpoTarget) +
        "</td>" +
        "</tr>"
      );
    })
    .join("\n");
}

function render(data) {
  const series = Dpo.analyzeSeries(data);
  const latest = series.latest;
  const coverage = data.meta && data.meta.coverage ? data.meta.coverage : "";
  const monthCount = series.months.length;
  const latestLabel = latest ? Dpo.monthLabel(latest.month) : "—";
  const dpoText = latest ? Dpo.formatDays(latest.dpo) : "—";
  const momText = latest ? Dpo.formatPercent(latest.mom, true, 1) : "—";
  const momHint =
    latest && series.previous
      ? "vs " +
        Dpo.monthLabel(series.previous.month) +
        " (" +
        Dpo.formatDays(series.previous.dpo) +
        " days)"
      : "MoM change needs a prior month with a defined DPO";
  const targetDpo = series.targets && Dpo.isFiniteNumber(series.targets.dpoDays)
    ? Dpo.formatDays(series.targets.dpoDays, 0)
    : "—";
  const sparkCols = Math.max(monthCount, 1);
  const bestText = series.best
    ? Dpo.monthLabel(series.best.month) + " · " + Dpo.formatDays(series.best.dpo)
    : "—";
  const worstText = series.worst
    ? Dpo.monthLabel(series.worst.month) + " · " + Dpo.formatDays(series.worst.dpo)
    : "—";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DPO Trend Tracker</title>
  <meta name="description" content="Days Payable Outstanding trend tracker with payable mix, MoM change, and target comparisons. First paint is fully baked HTML.">
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <div class="kicker">Working capital · payables</div>
      <h1>DPO Trend Tracker</h1>
      <p>
        ${monthCount} months of sample Days Payable Outstanding (${escapeHtml(coverage)}).
        Summary metrics and the monthly table below are baked into this HTML so a static
        <code>curl -sL</code> first paint shows DPO, MoM change, payable mix, target comparisons, and every month row with no JavaScript placeholder.
      </p>
    </header>

    <section class="metrics" aria-label="Summary metrics">
      <article class="card" id="metric-dpo">
        <h2>DPO</h2>
        <p class="value">${escapeHtml(dpoText)}</p>
        <p class="hint">${escapeHtml(latestLabel)} · days payable outstanding</p>
      </article>
      <article class="card" id="metric-mom">
        <h2>MoM change</h2>
        <p class="value ${toneClass(latest && latest.mom)}">${escapeHtml(momText)}</p>
        <p class="hint">${escapeHtml(momHint)}</p>
      </article>
      <article class="card" id="metric-best-worst">
        <h2>Best / worst</h2>
        <p class="sub">Best (highest): ${escapeHtml(bestText)}</p>
        <p class="sub">Worst (lowest): ${escapeHtml(worstText)}</p>
      </article>
      <article class="card" id="metric-targets">
        <h2>Target comparisons</h2>
        <p class="sub">DPO target ${escapeHtml(targetDpo)} days: ${latest ? targetCopy(latest.vsDpoTarget, "days") : "—"}</p>
        <p class="sub">Higher DPO is favorable for cash (CCC). Over target is good; under target means paying too fast.</p>
      </article>
    </section>

    <section class="mix" id="payable-mix" aria-label="Payable mix">
      <h2>Payable mix</h2>
      <p class="hint">Percent of ending AP by category for ${escapeHtml(latestLabel)}.</p>
      <div class="mix-grid">
        ${mixRows(latest)}
      </div>
    </section>

    <section class="trend" aria-label="DPO sparkline">
      <h2>Monthly DPO</h2>
      <div class="spark" style="grid-template-columns: repeat(${sparkCols}, 1fr)">${sparkBars(series.months)}</div>
    </section>

    <section aria-label="Monthly table">
      <h2>Monthly table</h2>
      <p class="hint">Click a column header to sort after JavaScript loads. Rows and values are already in the markup.</p>
      <p id="selected-month"></p>
      <div class="table-wrap">
        <table id="monthly-table">
          <thead>
            <tr>
              <th data-sort="month" data-type="string">Month</th>
              <th data-sort="trade" data-type="number">Trade payables</th>
              <th data-sort="logistics" data-type="number">Logistics</th>
              <th data-sort="services" data-type="number">Services</th>
              <th data-sort="accrued" data-type="number">Accrued</th>
              <th data-sort="other" data-type="number">Other</th>
              <th data-sort="apEnding" data-type="number">AP ending</th>
              <th data-sort="purchases" data-type="number">Purchases</th>
              <th data-sort="days" data-type="number">Days</th>
              <th data-sort="dpo" data-type="number">DPO</th>
              <th data-sort="mom" data-type="number">MoM</th>
              <th>vs DPO target</th>
            </tr>
          </thead>
          <tbody>
${monthRows(series.months)}
          </tbody>
        </table>
      </div>
    </section>

    <footer>
      <p>Formula: DPO = AP ending / (purchases / days in period). Purchases are the COGS-equivalent denominator. Sample source data: <a href="data/dpo.json"><code>data/dpo.json</code></a>. Re-render with <code>node scripts/render-static.js</code>.</p>
    </footer>
  </div>
  <script src="js/dpo.js" defer></script>
  <script src="js/app.js" defer></script>
</body>
</html>
`;
}

function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const html = render(data);
  fs.writeFileSync(OUT_PATH, html);
  const series = Dpo.analyzeSeries(data);
  process.stdout.write(
    "Wrote " +
      path.relative(ROOT, OUT_PATH) +
      " with " +
      series.months.length +
      " month rows; latest DPO " +
      (series.latest ? Dpo.formatDays(series.latest.dpo) : "—") +
      "\n"
  );
}

main();
