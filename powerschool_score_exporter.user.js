// ==UserScript==
// @name         PowerSchool Assessment Score Export
// @namespace    https://github.com/Eric-1029/Powerschool_score_exporter
// @version      1.1.0
// @description  Extract assignment scores from PowerSchool Details by Assessment pages.
// @match        https://sishrsb.ednet.ns.ca/guardian/viewbyassessment.html*
// @run-at       document-idle
// @grant        GM_setClipboard
// @license      MIT
// ==/UserScript==
// @updateURL    https://github.com/Eric-1029/Powerschool_score_exporter/raw/refs/heads/main/powerschool_score_exporter.user.js
// @downloadURL  https://github.com/Eric-1029/Powerschool_score_exporter/raw/refs/heads/main/powerschool_score_exporter.user.js
(function () {
  'use strict';

  const PANEL_ID = 'ps-assessment-score-export-panel';
  const STYLE_ID = 'ps-assessment-score-export-style';
  const STATUS_ID = 'ps-assessment-score-export-status';
  const OUTPUT_ID = 'ps-assessment-score-export-output';
  const REFRESH_ID = 'ps-assessment-score-export-refresh';
  const IGNORE_EXCLUSION_ID = 'ps-assessment-score-export-ignore-exclusion';
  const COPY_ID = 'ps-assessment-score-export-copy';
  const TOGGLE_ID = 'ps-assessment-score-export-toggle';
  const MARK_ID = 'ps-assessment-score-export-mark';

  let pluginEnabled = false;
  let ignoreFinalGradeExclusion = false;

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
    const countInTotal = (ignoreFinalGradeExclusion || !isExcludedFromFinalGrade(row)) && !absent;

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
      #${TOGGLE_ID} {
        vertical-align: middle;
      }

      #${MARK_ID} {
        margin: 6px 0 4px;
        padding-top: 6px;
        border-top: 1px solid #ccc;
        overflow-wrap: anywhere;
      }

      #${MARK_ID} strong {
        display: block;
      }

      #${PANEL_ID} .ps-assessment-score-export-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin: 0 10px 10px;
      }

      #${PANEL_ID} .ps-assessment-score-export-actions button {
        margin: 0;
      }

      #${STATUS_ID}, #${PANEL_ID} label {
        display: block;
        margin: 0 10px 10px;
      }

      #${OUTPUT_ID} {
        display: block;
        width: calc(100% - 20px);
        margin: 0 10px 10px;
        box-sizing: border-box;
        resize: vertical;
        font-family: monospace;
      }

      #${PANEL_ID}[hidden], #${MARK_ID}[hidden] {
        display: none;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureUi() {
    if (document.getElementById(TOGGLE_ID)) {
      return true;
    }

    const courseTable = document.getElementById('coursetable');
    const markHeader = Array.from(courseTable?.querySelectorAll('thead th') || []).find((header) =>
      /^In-Progress Mark\b/i.test(normalizeText(header.textContent))
    );
    const markCell = markHeader && courseTable.querySelector('tbody tr')?.cells[markHeader.cellIndex];
    const planHeading = Array.from(document.querySelectorAll('h2')).find((heading) =>
      /^Assessment and Evaluation Plan$/i.test(normalizeText(heading.textContent))
    );

    if (!markCell || !planHeading) {
      return false;
    }

    const mark = document.createElement('div');
    mark.id = MARK_ID;
    mark.hidden = true;
    mark.setAttribute('aria-live', 'polite');
    markCell.appendChild(mark);

    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = 'box-round';
    panel.hidden = true;
    panel.innerHTML = `
      <h2>Assessment Score Export</h2>
      <div class="ps-assessment-score-export-actions">
        <button id="${REFRESH_ID}" type="button">Refresh</button>
        <button id="${IGNORE_EXCLUSION_ID}" type="button" aria-pressed="false" title="Include assessments marked 'Assessment is not included in final grade' in totals.">Ignore final-grade exclusion: Off</button>
        <button id="${COPY_ID}" type="button">Copy</button>
      </div>
      <p id="${STATUS_ID}" role="status">Waiting for assessment table...</p>
      <label for="${OUTPUT_ID}">Text / TSV report</label>
      <textarea id="${OUTPUT_ID}" rows="10" readonly spellcheck="false"></textarea>
    `;

    const planSection = planHeading.parentElement.classList.contains('box-round') ? planHeading.parentElement : planHeading;
    planSection.before(panel);

    panel.querySelector(`#${REFRESH_ID}`).addEventListener('click', () => refreshReport());
    const ignoreExclusionButton = panel.querySelector(`#${IGNORE_EXCLUSION_ID}`);
    ignoreExclusionButton.addEventListener('click', () => {
      ignoreFinalGradeExclusion = !ignoreFinalGradeExclusion;
      ignoreExclusionButton.setAttribute('aria-pressed', String(ignoreFinalGradeExclusion));
      ignoreExclusionButton.textContent = `Ignore final-grade exclusion: ${ignoreFinalGradeExclusion ? 'On' : 'Off'}`;
      refreshReport();
    });
    panel.querySelector(`#${COPY_ID}`).addEventListener('click', () => copyCurrentReport());

    const toggle = document.createElement('button');
    toggle.id = TOGGLE_ID;
    toggle.type = 'button';
    toggle.textContent = 'Enable Plugin';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('aria-controls', `${MARK_ID} ${PANEL_ID}`);
    toggle.addEventListener('click', () => {
      pluginEnabled = !pluginEnabled;
      toggle.textContent = pluginEnabled ? 'Disable Plugin' : 'Enable Plugin';
      toggle.setAttribute('aria-pressed', String(pluginEnabled));
      mark.hidden = !pluginEnabled;
      panel.hidden = !pluginEnabled;

      if (pluginEnabled) {
        refreshReport();
      }
    });
    markHeader.appendChild(toggle);

    return true;
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

  function refreshReport() {
    if (!pluginEnabled) {
      return;
    }

    const rows = extractRows();
    const mark = document.getElementById(MARK_ID);

    if (!rows.length) {
      latestReport = '';
      setStatus('No assessment rows found yet.');
      setOutput('');
      mark.textContent = 'Calculated Mark: n/a (no assessment rows found).';
      return;
    }

    const summary = summarize(rows);
    latestReport = buildReport(summary);

    const percent = summary.countedScoredRows.length && summary.possible > 0
      ? `${formatPercent12((summary.earned / summary.possible) * 100)}%`
      : 'n/a';
    mark.innerHTML = `
      <strong>Calculated Mark: ${percent}</strong>
      <div>Earned / Possible: ${formatNumber(summary.earned)} / ${formatNumber(summary.possible)}</div>
      <div>Counted: ${summary.countedRows.length} | Excluded: ${summary.excludedRows.length} | Unscored: ${summary.unscoredRows.length}</div>
      <div>Final-grade exclusions: ${ignoreFinalGradeExclusion ? 'ignored' : 'respected'}</div>
    `;

    setStatus(
      `Total: ${summary.rows.length} | Counted: ${summary.countedRows.length} | Excluded: ${summary.excludedRows.length} | Unscored counted: ${summary.unscoredRows.length}`
    );
    setOutput(latestReport);

    console.log('[PowerSchool] Assessment export summary:', summary);
  }

  async function copyCurrentReport() {
    if (!latestReport) {
      refreshReport();
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
    if (!ensureUi()) {
      if (attempt < 20) {
        setTimeout(() => boot(attempt + 1), 250);
      }
      return;
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

    refreshReport();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot(), { once: true });
  } else {
    boot();
  }
})();
