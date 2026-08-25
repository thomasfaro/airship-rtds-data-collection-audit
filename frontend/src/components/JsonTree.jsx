function Primitive({ value }) {
  if (value === null) return <span className="text-airship-blue-dark">null</span>;
  if (typeof value === "string") {
    return <span className="break-all text-teal-800">&quot;{value}&quot;</span>;
  }
  if (typeof value === "number") return <span className="text-amber-800">{value}</span>;
  if (typeof value === "boolean") return <span className="text-purple-700">{String(value)}</span>;
  return <span className="text-airship-body">{String(value)}</span>;
}

export default function JsonTree({
  value,
  label = "event",
  root = false,
  defaultOpen = null,
  className = "",
  arrayItemLabel = null,
}) {
  if (value === null || typeof value !== "object") {
    return (
      <div className={`font-mono text-xs leading-relaxed ${className}`.trim()}>
        {label ? <span className="font-medium text-airship-navy">{label}</span> : null}
        {label ? ": " : null}
        <Primitive value={value} />
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray ? value.map((item, index) => [index, item]) : Object.entries(value);
  const summaryLabel = label ? `${label}: ` : "";
  const summary = `${summaryLabel}${isArray ? "Array" : "Object"} (${entries.length})`;
  const open = defaultOpen ?? root;

  return (
    <details
      className={`group/json font-mono text-xs ${root ? `ml-0 w-full min-w-0${className ? ` ${className}` : ""}` : "ml-3"}`.trim()}
      open={open}
    >
      <summary className="cursor-pointer select-none list-none text-airship-blue hover:text-airship-navy [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block text-[9px] text-airship-muted transition group-open/json:rotate-90"
          >
            ▶
          </span>
          <span className="font-medium">{summary}</span>
        </span>
      </summary>
      <div className="mt-1 space-y-1 border-l-2 border-airship-border/80 pl-3">
        {entries.map(([key, child]) => {
          const childLabel =
            isArray && arrayItemLabel
              ? arrayItemLabel(Number(key), child)
              : String(key);
          return <JsonTree key={String(key)} value={child} label={childLabel} defaultOpen={false} />;
        })}
      </div>
    </details>
  );
}
