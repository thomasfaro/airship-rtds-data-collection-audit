import { useMemo, useState } from "react";
import { auditMismatchWarnings } from "../../lib/audit/auditMismatchWarnings.js";
import {
  MISMATCH_VISUAL,
  collectMismatchGroupItems,
  groupAuditWarnings,
} from "../../lib/audit/auditWarningGroups.js";
import {
  splitMessageWithHighlights,
  warningMessageHighlights,
} from "../../lib/audit/warningMessageDisplay.js";

const COLLAPSED_ITEMS = 5;

function warningText(item) {
  return typeof item === "string" ? item : (item.message ?? "");
}

function WarningMessage({ item }) {
  const parts = splitMessageWithHighlights(warningText(item), warningMessageHighlights(item));
  return (
    <span>
      {parts.map((part, index) =>
        part.bold ? (
          <strong key={index} className="font-semibold">
            {part.text}
          </strong>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </span>
  );
}

function WarningGroup({ group }) {
  const [expanded, setExpanded] = useState(false);
  const items = useMemo(() => collectMismatchGroupItems(group), [group]);
  const visual = MISMATCH_VISUAL[group.key] ?? MISMATCH_VISUAL.other;
  const visible = expanded ? items : items.slice(0, COLLAPSED_ITEMS);
  const hidden = items.length - visible.length;

  return (
    <div className={`rounded-xl border ${visual.border} ${visual.surface} px-3 py-2.5`}>
      <div className="flex items-baseline justify-between gap-2">
        <h4 className={`text-xs font-semibold uppercase tracking-wide ${visual.text}`}>
          {group.label}
        </h4>
        <span className={`text-xs tabular-nums ${visual.muted}`}>{group.count}</span>
      </div>
      <ul className={`mt-1.5 space-y-1 text-xs leading-relaxed ${visual.muted}`}>
        {visible.map((item, index) => (
          <li key={`${warningText(item)}-${index}`} className="flex gap-1.5">
            <span aria-hidden="true">·</span>
            <WarningMessage item={item} />
          </li>
        ))}
      </ul>
      {hidden > 0 || expanded ? (
        <button
          type="button"
          className={`mt-1.5 text-xs font-medium underline ${visual.text}`}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Show less" : `Show ${hidden} more`}
        </button>
      ) : null}
    </div>
  );
}

/** Compact, grouped view of the mismatch warnings the analysis produced. */
export default function WarningsList({ report }) {
  const groups = useMemo(() => groupAuditWarnings(auditMismatchWarnings(report)), [report]);
  const total = groups.reduce((sum, group) => sum + group.count, 0);

  return (
    <section className="card px-4 py-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-airship-navy">Warnings</h3>
        <p className="text-xs text-airship-muted">{total} found</p>
      </header>
      {total === 0 ? (
        <p className="mt-2 text-sm text-airship-muted">
          No tracking inconsistency was detected in this capture.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {groups.map((group) => (
            <WarningGroup key={group.key} group={group} />
          ))}
        </div>
      )}
    </section>
  );
}
