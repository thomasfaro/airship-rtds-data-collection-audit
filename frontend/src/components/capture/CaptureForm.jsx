import { useState } from "react";
import { Link } from "react-router-dom";
import TimezoneSelect from "../TimezoneSelect.jsx";
import StopModeCard from "./StopModeCard.jsx";

const START_HINTS = {
  earliest: "Replays the RTDS backlog first, so coverage builds up much faster.",
  latest: "Starts at the live edge of the stream and ignores the backlog.",
};

export default function CaptureForm({
  profileNames,
  profilesLoading,
  windowHoursOptions,
  settings,
  onChange,
  onSubmit,
  disabled,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const set = (key) => (value) => onChange({ ...settings, [key]: value });

  const hasProjects = profileNames.length > 0;
  const canStart = hasProjects && Boolean(settings.profile) && !disabled;

  return (
    <form
      className="card-padded space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (canStart) onSubmit();
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-xs font-medium text-airship-muted">
          Project
          <select
            className="input-field"
            value={settings.profile}
            onChange={(event) => set("profile")(event.target.value)}
            disabled={disabled || profilesLoading || !hasProjects}
            required
          >
            <option value="">{profilesLoading ? "Loading…" : "Select a project"}</option>
            {profileNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {!profilesLoading && !hasProjects && (
            <span className="mt-1 block text-[11px] text-airship-muted">
              No RTDS project yet — <Link to="/settings">add one</Link> to get started.
            </span>
          )}
        </label>

        <label className="block text-xs font-medium text-airship-muted">
          Report timezone
          <TimezoneSelect
            value={settings.timezone}
            onChange={set("timezone")}
            disabled={disabled}
          />
        </label>
      </div>

      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="section-title">How should the capture end?</legend>

        <StopModeCard
          id="realtime"
          label="Real-time auto-stop"
          badge="Recommended"
          description="Stops on its own once no new tracking keys have appeared for a while."
          selected={settings.stopMode === "realtime"}
          disabled={disabled}
          onSelect={set("stopMode")}
        >
          <div className="space-y-3">
            <p className="alert-warning">
              This assumes the project sends its data to Airship in real time. If the client feeds
              data through the API in batches instead — a nightly or hourly job rather than a live
              stream — the capture can end between two batches: the period it covers will have gaps,
              and every event, attribute or tag carried by the batches it missed will be absent from
              the tagging plan. Use Manual stop for those projects, and keep the capture running long
              enough to span at least one full batch cycle.
            </p>
            <p className="text-xs text-airship-muted">
              It waits for 1M events and one hour of processed time before it will even consider
              coverage complete, then for 100k more events and 30 minutes without a single new key.
              On a low-traffic project reaching that takes a while — you can always stop the capture
              by hand once you judge the coverage good enough.
            </p>
          </div>
        </StopModeCard>

        <StopModeCard
          id="manual"
          label="Manual stop"
          description="Runs until you click Stop. Works for every project, including those fed by API batches."
          selected={settings.stopMode === "manual"}
          disabled={disabled}
          onSelect={set("stopMode")}
        />
      </fieldset>

      <div className="border-t border-airship-border pt-4">
        <button
          type="button"
          className="link-nav"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
        >
          {advancedOpen ? "Hide advanced options" : "Advanced options"}
        </button>

        {advancedOpen && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-xs font-medium text-airship-muted">
              Start position
              <select
                className="input-field"
                value={settings.startPosition}
                onChange={(event) => set("startPosition")(event.target.value)}
                disabled={disabled}
              >
                <option value="earliest">Earliest available</option>
                <option value="latest">New events only</option>
              </select>
              <span className="mt-1 block text-[11px] text-airship-muted">
                {START_HINTS[settings.startPosition]}
              </span>
            </label>

            <label className="block text-xs font-medium text-airship-muted">
              Backlog limit
              <select
                className="input-field"
                value={settings.windowHours ?? ""}
                onChange={(event) => set("windowHours")(event.target.value || null)}
                disabled={disabled || settings.startPosition !== "earliest"}
              >
                <option value="">No limit</option>
                {windowHoursOptions.map((hours) => (
                  <option key={hours} value={hours}>
                    Last {hours}h of processed time
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-airship-muted">
                {settings.startPosition === "earliest"
                  ? "Caps how far back RTDS replays. Leave unlimited unless the backlog is huge."
                  : "Only applies when starting from the earliest available event."}
              </span>
            </label>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={!canStart}>
          Start capture
        </button>
        <p className="text-xs text-airship-muted">
          Only tracking events are captured (custom events, attributes, tags, screens,
          subscription lists). Nothing is written to disk except the finished analysis.
        </p>
      </div>
    </form>
  );
}
