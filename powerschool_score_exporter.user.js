// ==UserScript==
// @name         PowerSchool Assessment Score Export
// @namespace    https://github.com/Eric-1029/Powerschool_score_exporter
// @version      1.0.0
// @description  Extract assignment scores from PowerSchool Details by Assessment pages.
// @match        https://sishrsb.ednet.ns.ca/guardian/viewbyassessment.html*
// @run-at       document-idle
// @grant        GM_setClipboard
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  const PANEL_ID = 'ps-assessment-score-export-panel';
  const STYLE_ID = 'ps-assessment-score-export-style';
  const STATUS_ID = 'ps-assessment-score-export-status';
  const OUTPUT_ID = 'ps-assessment-score-export-output';
  const REFRESH_ID = 'ps-assessment-score-export-refresh';
  const COPY_ID = 'ps-assessment-score-export-copy';
  const HIDE_ID = 'ps-assessment-score-export-hide';
  const LAUNCHER_ID = 'ps-assessment-score-export-launcher';

  function normalizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function normalizeNumericText(value) {
    return normalizeText(value).replace(/,/g, '');
  }

  function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function round6(value) {
    return Math.round((value + Number.EPSILON) * 1000000) / 1000000;
  }

  function formatNumber(value) {
    return String(round2(value));
  }

  function formatPercent4(value) {
    return Number(value).toFixed(4);
  }

  function formatPercent12(value) {
    return Number(value).toFixed(12);
  }

  function textFromCellData(value) {
    if (value == null) {
      return '';
    }

    if (typeof value === 'string') {
      if (value.includes('<')) {
        const container = document.createElement('div');
        container.innerHTML = value;
        return normalizeText(container.textContent);
      }

      return normalizeText(value);
    }

    if (value.nodeType === Node.ELEMENT_NODE || value.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      return normalizeText(value.textContent);
    }

    return normalizeText(value);
  }

  function parseScore(rawText) {
    const text = normalizeNumericText(rawText);

    if (!text) {
      return { raw: '', numerator: null, denominator: null };
    }

    const match = text.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*\/\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/);

    if (!match) {
      return { raw: text, numerator: null, denominator: null };
    }

    const numerator = Number(match[1]);
    const denominator = Number(match[2]);

    if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
      return { raw: text, numerator: null, denominator: null };
    }

    return { raw: text, numerator, denominator };
  }

  function escapeTsv(value) {
    return normalizeText(value).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
  }

  function isElementVisible(element) {
    if (!element) {
      return false;
    }

    if (element.style && typeof element.style.display === 'string' && element.style.display) {
      return element.style.display !== 'none';
    }

    if (typeof window.getComputedStyle === 'function') {
      return window.getComputedStyle(element).display !== 'none';
    }

    return false;
  }

  function isExcludedFromFinalGrade(row) {
    const includedIcon = row.querySelector('img.included');
    return isElementVisible(includedIcon);
  }

  function isStatusVisible(row, className) {
    return isElementVisible(row.querySelector(`img.${className}`));
  }

  function getPanel() {
    return document.getElementById(PANEL_ID);
  }

  function getLauncher() {
    return document.getElementById(LAUNCHER_ID);
  }

  function showPanel() {
    const panel = getPanel();
    const launcher = getLauncher();

    if (panel) {
      panel.classList.remove('is-hidden');
    }

    if (launcher) {
      launcher.classList.add('is-hidden');
    }

    refreshPanel();
  }

  function hidePanel() {
    const panel = getPanel();
    const launcher = getLauncher();

    if (panel) {
      panel.classList.add('is-hidden');
    }

    if (launcher) {
      launcher.classList.remove('is-hidden');
    }
  }

  function getTable() {
    return document.querySelector('#maintable');
  }

  function getHeaderIndexes(table) {
    const headerTexts = Array.from(table.querySelectorAll('thead th')).map((header) => normalizeText(header.textContent));

    const findIndex = (pattern, fallback) => {
      const index = headerTexts.findIndex((text) => pattern.test(text));
      return index >= 0 ? index : fallback;
    };

    return {
      dateIndex: findIndex(/^Due Date$/i, 0),
      categoryIndex: findIndex(/^Category$/i, 1),
      assessmentIndex: findIndex(/^Assessment$/i, 2),
    };
  }

  function extractRowFromElement(row, rowNumber, indexes) {
    const cells = Array.from(row.querySelectorAll('td'));

    if (!cells.length) {
      return null;
    }

    const assessmentCell = cells[indexes.assessmentIndex];
    const assessmentLink = assessmentCell?.querySelector('a.dialogM') || assessmentCell?.querySelector('a');
    const scoreIndex = Math.max(cells.length - 2, 0);
    const commentIndex = Math.max(cells.length - 1, 0);
    const scoreCell = cells[scoreIndex];
    const collected = isStatusVisible(row, 'collected');
    const incomplete = isStatusVisible(row, 'incomplete');
    let score = parseScore(scoreCell?.textContent || '');

    if (!score.raw && collected) {
      score = { raw: '1/1', numerator: 1, denominator: 1 };
    } else if (!score.raw && incomplete) {
      score = { raw: '0/1', numerator: 0, denominator: 1 };
    }

    const absent = isStatusVisible(row, 'absent');
    const countInTotal = !isExcludedFromFinalGrade(row) && !absent;

    return {
      rowNumber: rowNumber + 1,
      dueDate: textFromCellData(cells[indexes.dateIndex]?.textContent),
      category: textFromCellData(cells[indexes.categoryIndex]?.textContent),
      assessment: normalizeText(assessmentLink?.textContent || assessmentCell?.textContent),
      scoreText: score.raw || normalizeText(scoreCell?.textContent),
      numerator: score.numerator,
      denominator: score.denominator,
      comment: textFromCellData(cells[commentIndex]?.textContent),
      countInTotal,
    };
  }

  function extractRowsFromDom(table) {
    const indexes = getHeaderIndexes(table);
    const rows = Array.from(table.querySelectorAll('tbody tr'));

    return rows.map((row, rowNumber) => extractRowFromElement(row, rowNumber, indexes)).filter(Boolean);
  }

  function extractRowsFromDataTable(table) {
    if (!window.jQuery || !window.jQuery.fn || !window.jQuery.fn.dataTable || !window.jQuery.fn.dataTable.isDataTable(table)) {
      return null;
    }

    const api = window.jQuery(table).DataTable();
    const nodes = api.rows({ search: 'applied' }).nodes().toArray();
    const indexes = getHeaderIndexes(table);

    return nodes.map((row, rowNumber) => extractRowFromElement(row, rowNumber, indexes)).filter(Boolean);
  }

  function extractRows() {
    const table = getTable();

    if (!table) {
      return [];
    }

    const fromDataTable = extractRowsFromDataTable(table);
    if (fromDataTable && fromDataTable.length) {
      return fromDataTable;
    }

    return extractRowsFromDom(table);
  }

  function summarize(rows) {
    const excludedRows = rows.filter((row) => row.countInTotal === false);
    const countedRows = rows.filter((row) => row.countInTotal !== false);
    const countedScoredRows = countedRows.filter((row) => Number.isFinite(row.numerator) && Number.isFinite(row.denominator));
    const unscoredRows = countedRows.filter((row) => !Number.isFinite(row.numerator) || !Number.isFinite(row.denominator));
    const earned = countedScoredRows.reduce((sum, row) => sum + row.numerator, 0);
    const possible = countedScoredRows.reduce((sum, row) => sum + row.denominator, 0);
    const percent = possible > 0 ? (earned / possible) * 100 : null;

    return {
      rows,
      countedRows,
      countedScoredRows,
      excludedRows,
      unscoredRows,
      earned: round2(earned),
      possible: round2(possible),
      percent: percent == null ? null : round6(percent),
    };
  }

  function buildReport(summary) {
    const lines = [];

    lines.push('PowerSchool Assessment Score Export');
    lines.push(`Total rows: ${summary.rows.length}`);
    lines.push(`Counted rows: ${summary.countedRows.length}`);
    lines.push(`Excluded from total: ${summary.excludedRows.length}`);
    lines.push(`Counted rows with scores: ${summary.countedScoredRows.length}`);
    lines.push(`Unscored counted rows: ${summary.unscoredRows.length}`);

    if (summary.countedScoredRows.length) {
      lines.push(`Total earned / possible: ${formatNumber(summary.earned)} / ${formatNumber(summary.possible)}`);
      lines.push(summary.possible > 0 ? `Overall percentage: ${formatPercent12((summary.earned / summary.possible) * 100)}%` : 'Overall percentage: n/a');
    } else {
      lines.push('Total earned / possible: n/a');
      lines.push('Overall percentage: n/a');
    }

    lines.push('');
    lines.push(['#', 'Due Date', 'Category', 'Assessment', 'Score', 'Numerator', 'Denominator'].join('\t'));

    for (const row of summary.rows) {
      lines.push(
        [
          row.rowNumber,
          row.dueDate,
          row.category,
          row.assessment,
          row.scoreText,
          row.numerator ?? '',
          row.denominator ?? '',
        ]
          .map(escapeTsv)
          .join('\t')
      );
    }

    return lines.join('\n');
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        width: min(720px, calc(100vw - 32px));
        max-height: calc(100vh - 32px);
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
        border: 1px solid rgba(15, 23, 42, 0.18);
        border-radius: 14px;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 250, 252, 0.98));
        box-shadow: 0 18px 48px rgba(15, 23, 42, 0.24);
        color: #0f172a;
        font: 13px/1.45 Arial, Helvetica, sans-serif;
      }

      #${PANEL_ID} .ps-assessment-score-export-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        font-size: 14px;
        font-weight: 700;
      }

      #${PANEL_ID} .ps-assessment-score-export-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      #${PANEL_ID} button {
        appearance: none;
        border: 1px solid rgba(15, 23, 42, 0.16);
        border-radius: 10px;
        background: #fff;
        color: #0f172a;
        padding: 6px 10px;
        cursor: pointer;
        font: inherit;
      }

      #${PANEL_ID} button:hover {
        background: #f8fafc;
      }

      #${PANEL_ID} button:active {
        transform: translateY(1px);
      }

      #${STATUS_ID} {
        padding: 8px 10px;
        border-radius: 10px;
        background: rgba(15, 23, 42, 0.04);
        white-space: pre-wrap;
      }

      #${OUTPUT_ID} {
        width: 100%;
        min-height: 280px;
        max-height: calc(100vh - 240px);
        resize: vertical;
        border: 1px solid rgba(15, 23, 42, 0.16);
        border-radius: 12px;
        padding: 10px;
        background: #fff;
        color: #0f172a;
        font: 12px/1.5 Consolas, 'Courier New', monospace;
        box-sizing: border-box;
      }

      #${PANEL_ID}.is-hidden {
        display: none;
      }

      #${LAUNCHER_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        width: 18px;
        height: 18px;
        padding: 0;
        border: 1px solid rgba(255, 255, 255, 0.9);
        border-radius: 50%;
        background: #2563eb;
        box-shadow: 0 10px 22px rgba(15, 23, 42, 0.28);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      #${LAUNCHER_ID}.is-hidden {
        display: none;
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);

    if (panel) {
      return panel;
    }

    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="ps-assessment-score-export-title">
        <span>PowerSchool Assessment Score Export</span>
        <span id="${STATUS_ID}">Waiting for assessment table...</span>
      </div>
      <div class="ps-assessment-score-export-actions">
        <button id="${REFRESH_ID}" type="button">Refresh</button>
        <button id="${COPY_ID}" type="button">Copy</button>
        <button id="${HIDE_ID}" type="button">Hide</button>
      </div>
      <textarea id="${OUTPUT_ID}" readonly spellcheck="false"></textarea>
    `;

    document.body.appendChild(panel);

    panel.querySelector(`#${REFRESH_ID}`).addEventListener('click', () => refreshPanel());
    panel.querySelector(`#${COPY_ID}`).addEventListener('click', () => copyCurrentReport());
    panel.querySelector(`#${HIDE_ID}`).addEventListener('click', () => hidePanel());

    return panel;
  }

  function ensureLauncher() {
    let launcher = getLauncher();

    if (launcher) {
      return launcher;
    }

    launcher = document.createElement('button');
    launcher.id = LAUNCHER_ID;
    launcher.type = 'button';
    launcher.className = 'is-hidden';
    launcher.title = 'Open PowerSchool score export';
    launcher.setAttribute('aria-label', 'Open PowerSchool score export');
    launcher.addEventListener('click', () => showPanel());

    document.body.appendChild(launcher);
    return launcher;
  }

  function setStatus(text) {
    const status = document.getElementById(STATUS_ID);
    if (status) {
      status.textContent = text;
    }
  }

  function setOutput(text) {
    const output = document.getElementById(OUTPUT_ID);
    if (output) {
      output.value = text;
    }
  }

  let latestReport = '';

  function refreshPanel() {
    const rows = extractRows();

    if (!rows.length) {
      latestReport = '';
      setStatus('No assessment rows found yet.');
      setOutput('');
      return;
    }

    const summary = summarize(rows);
    latestReport = buildReport(summary);

    setStatus(
      `Total: ${summary.rows.length} | Counted: ${summary.countedRows.length} | Excluded: ${summary.excludedRows.length} | Unscored counted: ${summary.unscoredRows.length}` +
        (summary.countedScoredRows.length
          ? ` | Earned / Possible: ${formatNumber(summary.earned)} / ${formatNumber(summary.possible)} | ${formatPercent4(summary.percent)}%`
          : '')
    );
    setOutput(latestReport);

    console.log('[PowerSchool] Assessment export summary:', summary);
  }

  async function copyCurrentReport() {
    if (!latestReport) {
      refreshPanel();
    }

    if (!latestReport) {
      setStatus('Nothing to copy yet.');
      return;
    }

    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(latestReport, { type: 'text', mimetype: 'text/plain' });
        setStatus('Report copied to clipboard.');
        return;
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(latestReport);
        setStatus('Report copied to clipboard.');
        return;
      }

      const temp = document.createElement('textarea');
      temp.value = latestReport;
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      temp.remove();
      setStatus('Report copied to clipboard.');
    } catch (error) {
      console.error('[PowerSchool] Copy failed:', error);
      setStatus('Copy failed. See console for details.');
    }
  }

  function boot(attempt = 0) {
    injectStyle();
    ensurePanel();
    ensureLauncher();

    const launcher = getLauncher();
    if (launcher) {
      launcher.classList.add('is-hidden');
    }

    const table = getTable();
    const rowCount = table ? table.querySelectorAll('tbody tr').length : 0;

    if (!table || !rowCount) {
      if (attempt < 20) {
        setTimeout(() => boot(attempt + 1), 250);
        return;
      }

      setStatus('Assessment table not found.');
      return;
    }

    refreshPanel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot(), { once: true });
  } else {
    boot();
  }
})();