/** Large mutually exclusive card for the two ways a capture can end. */
export default function StopModeCard({
  id,
  label,
  description,
  selected,
  disabled = false,
  onSelect,
  children,
}) {
  return (
    <label
      className={[
        "block cursor-pointer rounded-airship-lg border p-4 transition",
        selected
          ? "border-airship-blue bg-airship-blue-light/40 shadow-card"
          : "border-airship-border bg-airship-surface hover:border-airship-blue-mid",
        disabled ? "cursor-not-allowed opacity-60" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <input
          type="radio"
          name="stop-mode"
          className="mt-1 h-4 w-4 accent-airship-blue"
          value={id}
          checked={selected}
          disabled={disabled}
          onChange={() => onSelect(id)}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-airship-navy">{label}</p>
          <p className="mt-1 text-sm text-airship-muted">{description}</p>
          {selected && children ? <div className="mt-3">{children}</div> : null}
        </div>
      </div>
    </label>
  );
}
