# DPO Trend Tracker

Public **Days Payable Outstanding** ledger: DPO, month-over-month change, payable mix, and target comparisons. **First paint is fully baked HTML** — a static `curl -sL` of `index.html` already contains every required metric and all 18 month rows. No JavaScript, and no `Loading…` shell.

## Data

[`data/dpo.json`](data/dpo.json) is **sample data** (see `meta.sample` / `meta.note`): 18 months (April 2025–September 2026) of ending accounts payable, purchases (COGS-equivalent denominator), payable mix (`trade`, `logistics`, `services`, `accrued`, `other`), and comparison targets.

## Formulas

All math lives in [`js/dpo.js`](js/dpo.js). Invalid, missing, or undefined results are **`null`**, never `NaN` or `Infinity`.

**DPO** for month \(t\):

\[
\mathrm{DPO}_t = \frac{\mathrm{AP}_t}{\mathrm{purchases}_t / \mathrm{days}_t} = \mathrm{AP}_t \times \mathrm{days}_t / \mathrm{purchases}_t
\]

`null` when AP is null, purchases/COGS is null, purchases/COGS is `0`, or days ≤ 0. Zero AP on positive purchases is `0`.

**MoM change** (on DPO):

\[
\Delta_t = \frac{\mathrm{DPO}_t - \mathrm{DPO}_{t-1}}{\mathrm{DPO}_{t-1}}
\]

`null` when either DPO is null, the prior DPO is `0`, the series is empty, or the series has a single month.

**Payable mix** (share of ending AP):

\[
m_{t,c} = \frac{p_{t,c}}{\mathrm{AP}_t}
\]

Every share is `null` when AP is null or `0`. A single-category month with AP > 0 is `1` for that category and `0` for the others.

**Target comparisons** for an actual \(A\) and goal \(G\):

\[
d = A - G, \qquad d\% = \frac{A - G}{G}
\]

`null` when \(A\) or \(G\) is null, or \(G = 0\). Higher DPO is favorable for cash (cash conversion cycle). Over target is good; under target means paying suppliers too quickly. Best / worst months are the highest and lowest finite DPO values.

## How to re-render

```bash
node scripts/render-static.js
```

That reads `data/dpo.json`, runs `js/dpo.js`, and overwrites `index.html` with baked summary cards, payable mix, spark bars, and the monthly table. Progressive enhancement in `js/app.js` (sortable columns, row select) is optional and must not replace first paint.

```bash
bash scripts/test.sh
```

Expect `Summary: N passed, 0 failed` and exit code 0. Checks cover zero/null/empty inputs, zero-purchase denominator months, single-month series, no `NaN`/`Infinity`, and static HTML first paint (including `curl -sL`).

## Layout

| Path | Role |
| --- | --- |
| `data/dpo.json` | Sample AP + purchases + payable mix + targets |
| `js/dpo.js` | Browser + Node module (`Dpo` / `module.exports`) |
| `scripts/render-static.js` | Static HTML generator |
| `index.html` | First-paint table (no JS required) |
| `css/styles.css` | Minimal layout |
| `js/app.js` | Optional sort / row select |
| `.nojekyll` | GitHub Pages: serve files as-is |
| `scripts/test.sh` | Fixtures, edge cases, static-HTML check |

## Suggested next improvements

- Replace the sample series with a live AP / purchase ledger and keep the same JSON shape.
- Add trailing-twelve-month DPO alongside calendar-month DPO, still baked at render time.
- Split targets by vendor class (trade vs logistics) so term-stretch programs are compared fairly.
- Publish to GitHub Pages as-is (`.nojekyll` is already in the repo).
