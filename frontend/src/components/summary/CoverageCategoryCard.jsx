import { useState } from "react";
import PlatformPills from "./PlatformPills.jsx";
import SourceBadge from "./SourceBadge.jsx";

const COLLAPSED_ROWS = 8;

export default function CoverageCategoryCard({ category }) {
  const [expanded, setExpanded] = useState(false);
  const { items, label, countLabel, emptyHint, itemCount, eventCount } = category;
  const visible = expanded ? items : items.slice(0, COLLAPSED_ROWS);
  const hidden = items.length - visible.length;

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-airship-border px-4 py-3">
        <h3 className="text-sm font-semibold text-airship-navy">{label}</h3>
        <p className="text-xs text-airship-muted">
          {itemCount.toLocaleString("en-US")} tracked
          {itemCount > 0 && ` · ${eventCount.toLocaleString("en-US")} ${countLabel}`}
        </p>
      </header>

      {items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-airship-muted">{emptyHint}</p>
      ) : (
        <>
          <ul className="divide-y divide-airship-border">
            {visible.map((item) => (
              <li key={item.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-airship-navy" title={item.name}>
                  {item.name}
                </span>
                <span className="tabular-nums text-xs font-semibold text-airship-navy">
                  {item.count.toLocaleString("en-US")}
                </span>
                {item.sources.map((source) => (
                  <SourceBadge key={source} source={source} />
                ))}
                <PlatformPills platforms={item.platforms} missingPlatforms={item.missingPlatforms} />
                {item.versionScope ? (
                  <span
                    className="text-[11px] text-airship-muted"
                    title="App versions this item was seen on"
                  >
                    {item.versionScope}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {hidden > 0 || expanded ? (
            <button
              type="button"
              className="w-full border-t border-airship-border px-4 py-2 text-xs font-medium text-airship-blue hover:bg-airship-blue-light/30"
              onClick={() => setExpanded((open) => !open)}
            >
              {expanded ? "Show less" : `Show ${hidden.toLocaleString("en-US")} more`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
