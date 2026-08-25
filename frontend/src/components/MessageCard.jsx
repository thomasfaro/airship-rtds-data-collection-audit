import JsonTree from "./JsonTree.jsx";

export default function MessageCard({ payload, isError = false }) {
  return (
    <article
      className={`overflow-hidden rounded-xl border border-l-4 bg-airship-surface ${
        isError ? "border-l-airship-danger" : "border-l-airship-muted"
      }`}
    >
      <div className="p-3">
        <JsonTree value={payload} label="message" root />
      </div>
    </article>
  );
}
