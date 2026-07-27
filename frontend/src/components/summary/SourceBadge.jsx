const CLASS_BY_SOURCE = {
  SDK: "badge-blue",
  API: "badge-seafoam",
  Unknown: "badge-amber",
};

/** Where the data came from: the mobile/web SDK, the server-side API, or undetermined. */
export default function SourceBadge({ source }) {
  return <span className={CLASS_BY_SOURCE[source] ?? "badge-amber"}>{source}</span>;
}
