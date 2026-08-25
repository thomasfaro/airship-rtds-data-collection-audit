/**
 * Presentation layer for the tagging-plan workbook: the app palette, and the
 * pure helpers that turn report numbers into something scannable.
 *
 * Everything here has to survive a Google Sheets import, which rules out the
 * spreadsheet features Sheets drops on the floor — data bars and icon sets are
 * gone the moment the file lands there. Fills, fonts, borders, number formats,
 * frozen panes, filters and plain text always make it through, so every colour
 * is a static fill and every bar is text.
 */

/** Straight from frontend/tailwind.config.js, so the file matches the screen. */
export const PALETTE = {
  navy: "FF000818",
  navySoft: "FF1F2A37",
  body: "FF414651",
  muted: "FF535862",
  blue: "FF056DFF",
  blueDark: "FF0451BD",
  blueLight: "FFDCEAFF",
  blueMid: "FF7ABFFF",
  seafoam: "FF11DBC0",
  offWhite: "FFF7F8F8",
  surface: "FFFFFFFF",
  surfaceMuted: "FFF5F5F5",
  border: "FFE5E7EB",
  borderStrong: "FFD5D7DA",
  white: "FFFFFFFF",
  // The app says "warning" in amber (.alert-warning) and "error" in airship
  // danger (.status-error). The tints are those hues at a fraction of their
  // strength: enough to spot a cluster of flagged rows while reading the text
  // on top of them, which a saturated fill makes surprisingly hard.
  warnTint: "FFFFFBEB",
  warnText: "FF78350F",
  dangerTint: "FFFFEFF4",
  dangerText: "FFFF3976",
};

/** Tab colours split eleven sheets into the three things they are. */
export const TAB_COLORS = {
  overview: PALETTE.navy,
  catalogue: PALETTE.blue,
  values: PALETTE.seafoam,
};

const FULL = "\u2588";
const HALF = "\u258C";
const SLIVER = "\u258F";

/**
 * Eight units, and a column wide enough for nine glyphs. A block character is
 * about twice the width of the column-width unit, and a bar that outgrows its
 * column is clipped by the cell next to it — which would quietly make every
 * share above ~70% look identical.
 */
export const BAR_UNITS = 8;
export const BAR_COLUMN_WIDTH = 20;

/**
 * A share, as a bar of block characters. Anything above zero leaves a mark, so
 * the long tail every tagging plan has reads as small rather than as missing.
 */
export function shareBar(ratio, { units = BAR_UNITS } = {}) {
  if (!Number.isFinite(ratio) || ratio <= 0) return "";
  const filled = Math.min(1, ratio) * units;
  const full = Math.floor(filled);
  const bar = FULL.repeat(full) + (filled - full >= 0.5 ? HALF : "");
  return bar || SLIVER;
}

/**
 * Column carrying an item's share of its sheet. `bar: true` asks the writer to
 * render the bar next to it, so the number stays sortable and the picture stays
 * out of the data model.
 */
export function shareColumn(label = "% of total", key = "share") {
  return { key, label, type: "pct", width: 12, bar: true };
}

/**
 * Fill in each row's share of the column total. Section bands and total rows
 * stay out of both the denominator and the result: a band has no volume, and a
 * total row would otherwise count everything twice and then claim 50%.
 */
export function withShares(rows, valueOf, { key = "share" } = {}) {
  const counted = rows.filter((r) => !r.__section && !r.__total);
  const total = counted.reduce((sum, r) => sum + (valueOf(r) || 0), 0);
  for (const row of counted) {
    row[key] = total > 0 ? (valueOf(row) || 0) / total : 0;
  }
  return rows;
}

/**
 * Reorder value rows so a distribution can be read in one pass: groups by
 * weight, values by count inside their group, and the first row of a group
 * marked so the writer can draw a separator.
 *
 * The share is relative to the group, because that is the question these sheets
 * answer — how does this attribute's traffic split across its values. Sorted
 * purely by count, as the collector leaves them, the values of one key end up
 * scattered across the whole sheet.
 */
export function groupValueRows(rows, groupOf, { countOf = (r) => r.count ?? 0, key = "share" } = {}) {
  const groups = new Map();
  for (const row of rows ?? []) {
    const groupKey = groupOf(row);
    if (!groups.has(groupKey)) groups.set(groupKey, { rows: [], total: 0, label: String(groupKey) });
    const group = groups.get(groupKey);
    group.rows.push(row);
    group.total += countOf(row) || 0;
  }

  const ordered = [...groups.values()].sort(
    (a, b) => b.total - a.total || a.label.localeCompare(b.label),
  );

  const out = [];
  for (const group of ordered) {
    group.rows.sort((a, b) => (countOf(b) || 0) - (countOf(a) || 0));
    group.rows.forEach((row, index) => {
      out.push({
        ...row,
        // No counts at all means the fallback path, where the report carries
        // sample values and no volumes. An empty cell says that; "0.0%" claims
        // to know the value is never sent.
        [key]: group.total > 0 ? (countOf(row) || 0) / group.total : null,
        __groupStart: index === 0,
      });
    });
  }
  return out;
}
