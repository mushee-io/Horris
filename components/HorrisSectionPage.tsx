import type { ReactNode } from "react";
import HorrisRouteFooter from "./HorrisRouteFooter";
import HorrisRouteNav from "./HorrisRouteNav";

type Module = { index: string; label: string; title: string; body: string; meta?: string[] };
type Fact = { label: string; value: string; tone?: "safe" | "warn" | "danger" };

export default function HorrisSectionPage({
  code,
  eyebrow,
  title,
  intro,
  modules,
  facts,
  darkTitle,
  darkBody,
}: {
  code: string;
  eyebrow: string;
  title: ReactNode;
  intro: string;
  modules: Module[];
  facts?: Fact[];
  darkTitle: string;
  darkBody: string;
}) {
  return <main className="horris-site route-page">
    <HorrisRouteNav />
    <section className="route-hero technical-grid">
      <div className="route-rail"><span>{code}</span><small>{eyebrow}</small></div>
      <div className="route-hero-copy"><p className="route-kicker">HORRIS / {eyebrow}</p><h1>{title}</h1><p>{intro}</p><div className="route-actions"><a className="signal-button" href="/terminal">LAUNCH TERMINAL <b>→</b></a><a className="technical-button" href="/">BACK HOME</a></div></div>
      <aside className="route-scope"><span>[ CONTROL SURFACE ]</span><strong>PRECISION<br/>BEFORE<br/>EXECUTION.</strong><small>HORRIS ROUTE / {code}</small></aside>
    </section>

    <section className="route-module-grid technical-grid">
      {modules.map((module) => <article className="route-module" key={module.index}>
        <header><span>{module.index}</span><strong>{module.label}</strong><b>→</b></header>
        <h2>{module.title}</h2><p>{module.body}</p>
        {module.meta?.length ? <ul>{module.meta.map((item) => <li key={item}>{item}</li>)}</ul> : null}
      </article>)}
    </section>

    {facts?.length ? <section className="route-facts technical-grid">{facts.map((fact) => <div key={fact.label}><small>{fact.label}</small><strong className={fact.tone === "safe" ? "safe-text" : fact.tone === "danger" ? "danger-text" : fact.tone === "warn" ? "warn-text" : ""}>{fact.value}</strong></div>)}</section> : null}

    <section className="route-dark technical-grid"><div><small>// HORRIS / SYSTEM PRINCIPLE</small><h2>{darkTitle}</h2></div><p>{darkBody}</p><a href="/terminal">[ OPEN CONTROL TERMINAL ]</a></section>
    <HorrisRouteFooter />
  </main>;
}
