
# PowerSchool Assessment Score Export

A Tampermonkey userscript that extracts assignment scores from the PowerSchool **Details by Assessment** page and creates a copyable text/TSV report.

> This project is not affiliated with, endorsed by, or sponsored by PowerSchool.

## Features

- Extracts assessment scores from PowerSchool
- Adds an **Enable Plugin** button beside **In-Progress Mark**
- Shows a detailed calculated mark below the original mark and embeds export controls above **Assessment and Evaluation Plan**, using the page's native styles
- Calculates earned points, possible points, and overall percentage
- Detects excluded, collected, incomplete, and unscored rows
- Toggles whether assessments marked "Assessment is not included in final grade" count in totals
- Copies the report to the clipboard
- Outputs spreadsheet-friendly TSV text

## Supported Page

```text
https://sishrsb.ednet.ns.ca/guardian/viewbyassessment.html*
```

## Installation

1. Install Tampermonkey.
2. Open this link:

```text
https://github.com/Eric-1029/Powerschool_score_exporter/raw/refs/heads/main/powerschool_score_exporter.user.js
```

3. Click **Install** in Tampermonkey.

## Usage

1. Open the supported PowerSchool assessment page.
2. Click **Enable Plugin** beside **In-Progress Mark**. The calculated percentage and point totals appear below the original mark; the export section appears above **Assessment and Evaluation Plan**.
3. Click Display **All** records per page.
4. Click **Refresh** to update the data.
5. Optionally click **Ignore final-grade exclusion: Off** to include assessments marked "Assessment is not included in final grade". The button switches to **On** and recalculates the report immediately. Click again to restore the default calculation. Absent assessments remain excluded, and rows without numeric scores do not contribute points.
6. Click **Copy** to copy the report.
7. Paste it into Google Sheets, Excel, or another spreadsheet app.

Click **Disable Plugin** to hide the calculated mark and export section. Enabling it again refreshes the report and retains the final-grade exclusion setting for the current page session.

## Output

The copied report includes:

```text
Total rows
Counted rows
Excluded rows
Unscored rows
Total earned / possible
Overall percentage
```

Then it outputs a TSV table with:

```text
#	Due Date	Category	Assessment	Score	Numerator	Denominator
```

```js
// ==/UserScript==
```

## License

MIT License
```
