/** Platforms an item was seen on, with its event count per platform. */
export default function PlatformPills({ platforms, missingPlatforms = [] }) {
  if (platforms.length === 0 && missingPlatforms.length === 0) {
    return <span className="text-xs text-airship-muted-light">—</span>;
  }

  return (
    <span className="flex flex-wrap items-center gap-1">
      {platforms.map(({ platform, count }) => (
        <span
          key={platform}
          className="inline-flex items-center gap-1 rounded-pill bg-airship-surface-muted px-2 py-0.5 text-[11px] font-medium text-airship-navy-soft"
          title={`${count.toLocaleString("en-US")} events on ${platform}`}
        >
          {platform}
          <span className="tabular-nums text-airship-muted">{count.toLocaleString("en-US")}</span>
        </span>
      ))}
      {missingPlatforms.map((platform) => (
        <span
          key={`missing-${platform}`}
          className="inline-flex items-center rounded-pill bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900"
          title={`Not seen on ${platform}, although other platforms report this item`}
        >
          missing on {platform}
        </span>
      ))}
    </span>
  );
}
