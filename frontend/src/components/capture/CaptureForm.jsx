import { useState } from "react";
import { Link } from "react-router-dom";
import TimezoneSelect from "../TimezoneSelect.jsx";
import StopModeCard from "./StopModeCard.jsx";

const SENSITIVITY_HINTS = {
  thorough:
    "Waits for 1M events and one hour of processed time before it will consider coverage complete. Safest choice.",
  fast: "Stops after 100k events and 30 minutes of processed time. Good for low-traffic projects, may miss rare events.",
};

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
          id="manual"
          label="Manual stop"
          description="The capture runs until you click Stop. Works for every project."
          selected={settings.stopMode === "manual"}
          disabled={disabled}
          onSelect={set("stopMode")}
        />

        <StopModeCard
          id="realtime"
          label="Real-time auto-stop"
          description="Stops on its own once no new tracking keys have appeared for a while."
          selected={settings.stopMode === "realtime"}
          disabled={disabled}
          onSelect={set("stopMode")}
        >
          <div className="space-y-3">
            <p className="alert-warning">
              Only use this on projects that send data in real time. If the client pushes daily API
              batches, the capture can stop before a batch arrives and the tagging plan will be
              incomplete — use Manual stop instead.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {["thorough", "fast"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => set("realtimePreset")(preset)}
                  className={
                    settings.realtimePreset === preset
                      ? "rounded-pill bg-airship-blue px-3 py-1.5 text-xs font-semibold text-white"
                      : "rounded-pill border border-airship-border-strong px-3 py-1.5 text-xs font-semibold text-airship-navy hover:border-airship-blue"
                  }
                >
                  {preset === "thorough" ? "Thorough" : "Fast"}
                </button>
              ))}
            </div>
            <p className="text-xs text-airship-muted">
              {SENSITIVITY_HINTS[settings.realtimePreset] ?? SENSITIVITY_HINTS.thorough}
            </p>
          </div>
        </StopModeCard>
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
