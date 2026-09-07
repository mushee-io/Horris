"use client";

import { usePathname } from "next/navigation";

const links = [
  ["/protocol", "PROTOCOL"],
  ["/engine", "ENGINE"],
  ["/network", "NETWORK"],
  ["/research", "RESEARCH"],
  ["/docs", "DOCS"],
] as const;

export default function HorrisRouteNav() {
  const pathname = usePathname();
  return (
    <nav className="marketing-nav technical-grid route-nav">
      <a className="wordmark" href="/">HORRIS</a>
      <div className="marketing-links">
        {links.map(([href, label]) => <a key={href} href={href} className={pathname === href ? "active" : ""}>{label}</a>)}
      </div>
      <span className="nav-note">[ ] BUILD A SAFER ONCHAIN FUTURE [ ]</span>
      <a className={pathname === "/terminal" ? "signal-button active" : "signal-button"} href="/terminal">LAUNCH TERMINAL <b>→</b></a>
    </nav>
  );
}
