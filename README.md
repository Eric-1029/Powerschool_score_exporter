
# PowerSchool Assessment Score Export

A Tampermonkey userscript that extracts assignment scores from the PowerSchool **Details by Assessment** page and creates a copyable text/TSV report.

> This project is not affiliated with, endorsed by, or sponsored by PowerSchool.

## Features

- Extracts assessment scores from PowerSchool
- Shows a floating export panel
- Calculates earned points, possible points, and overall percentage
- Detects excluded, collected, incomplete, and unscored rows
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
2. Wait for the floating panel to appear.
3. Click **Refresh** to update the data.
4. Click **Copy** to copy the report.
5. Paste it into Google Sheets, Excel, or another spreadsheet app.

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
