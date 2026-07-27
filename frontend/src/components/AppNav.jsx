import { NavLink } from "react-router-dom";
import { useCaptureSession } from "../contexts/CaptureSessionContext.jsx";

const LINKS = [
  { to: "/", label: "Capture" },
  { to: "/history", label: "History" },
  { to: "/settings", label: "Projects" },
];

function navClass({ isActive }) {
  return [
    "rounded-pill px-3 py-1.5 text-sm font-medium transition",
    isActive
      ? "bg-airship-blue-light text-airship-blue-dark"
      : "text-airship-muted hover:bg-airship-surface-muted hover:text-airship-navy",
  ].join(" ");
}

export default function AppNav() {
  const { active } = useCaptureSession();

  return (
    <header className="sticky top-0 z-40 border-b border-airship-border bg-airship-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:px-6">
        <div className="flex items-baseline gap-2">
          <span className="logo-wordmark">Airship</span>
          <span className="text-sm font-semibold text-airship-muted">
            RTDS Data Collection Audit
          </span>
        </div>
        <nav className="flex items-center gap-1">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === "/"} className={navClass}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        {active && (
          <span className="ml-auto inline-flex items-center gap-2 text-xs font-semibold text-teal-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-airship-seafoam" />
            Capture running
          </span>
        )}
      </div>
    </header>
  );
}
