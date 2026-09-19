/**
 * Progressive enhancement only. First paint is already complete in index.html.
 * Adds table sorting and a live "selected month" readout without replacing baked metrics.
 */
(function () {
  "use strict";

  function initSortableTable() {
    var table = document.getElementById("monthly-table");
    if (!table) return;
    var tbody = table.tBodies[0];
    var headers = table.querySelectorAll("thead th[data-sort]");
    if (!tbody || !headers.length) return;

    var current = { key: "month", dir: "asc" };

    function cellValue(row, key, type) {
      var cell = row.querySelector('[data-key="' + key + '"]');
      if (!cell) return null;
      if (type === "number") {
        var raw = cell.getAttribute("data-value");
        if (raw == null || raw === "") return null;
        var n = Number(raw);
        return Number.isFinite(n) ? n : null;
      }
      return cell.getAttribute("data-value") || cell.textContent || "";
    }

    function compare(a, b, key, type, dir) {
      var av = cellValue(a, key, type);
      var bv = cellValue(b, key, type);
      var mul = dir === "desc" ? -1 : 1;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (type === "number") return (av - bv) * mul;
      return String(av).localeCompare(String(bv)) * mul;
    }

    headers.forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-sort");
        var type = th.getAttribute("data-type") || "string";
        if (current.key === key) {
          current.dir = current.dir === "asc" ? "desc" : "asc";
        } else {
          current.key = key;
          current.dir = key === "month" ? "asc" : "desc";
        }
        headers.forEach(function (h) {
          h.removeAttribute("aria-sort");
        });
        th.setAttribute("aria-sort", current.dir === "asc" ? "ascending" : "descending");
        var rows = Array.prototype.slice.call(tbody.rows);
        rows.sort(function (a, b) {
          return compare(a, b, key, type, current.dir);
        });
        rows.forEach(function (row) {
          tbody.appendChild(row);
        });
      });
    });
  }

  function initRowHighlight() {
    var table = document.getElementById("monthly-table");
    var note = document.getElementById("selected-month");
    if (!table || !note) return;
    table.addEventListener("click", function (event) {
      var row = event.target.closest("tbody tr");
      if (!row) return;
      Array.prototype.forEach.call(table.querySelectorAll("tbody tr"), function (tr) {
        tr.classList.remove("is-selected");
      });
      row.classList.add("is-selected");
      var label = row.getAttribute("data-label") || "";
      var total = row.getAttribute("data-total") || "";
      note.textContent = label ? "Selected: " + label + (total ? " · " + total : "") : "";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initSortableTable();
      initRowHighlight();
    });
  } else {
    initSortableTable();
    initRowHighlight();
  }
})();
