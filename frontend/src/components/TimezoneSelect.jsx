import { useMemo } from "react";
import {
  detectDeviceTimezone,
  formatTimezoneOption,
  groupTimezones,
  listTimezones,
} from "../lib/timezones.js";

export default function TimezoneSelect({ value, onChange, disabled = false, id, className = "input-field" }) {
  const deviceTimezone = useMemo(() => detectDeviceTimezone(), []);
  const groups = useMemo(() => {
    const all = listTimezones();
    const withoutDevice = all.filter((tz) => tz !== deviceTimezone);
    return groupTimezones(withoutDevice);
  }, [deviceTimezone]);

  return (
    <select
      id={id}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      <optgroup label="This device">
        <option value={deviceTimezone}>{formatTimezoneOption(deviceTimezone)}</option>
      </optgroup>
      {groups.map(([region, zones]) => (
        <optgroup key={region} label={region}>
          {zones.map((tz) => (
            <option key={tz} value={tz}>
              {formatTimezoneOption(tz)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
