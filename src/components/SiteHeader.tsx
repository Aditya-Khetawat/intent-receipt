"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion } from "motion/react";
import { ThemeToggle } from "./ThemeToggle";
import { SLIDE } from "./motion";

const buyerLinks = [
  { href: "/shop", label: "Shop" },
  { href: "/orders", label: "Orders" },
];
const merchantLinks = [{ href: "/merchant", label: "Disputes console" }];

export function SiteHeader() {
  const path = usePathname();
  const merchant = path.startsWith("/merchant");
  const links = [...(merchant ? merchantLinks : buyerLinks), { href: "/demo", label: "Guided demo" }];
  const isActive = (href: string) => (href === "/demo" ? path === "/demo" : path.startsWith(href));
  // The active pill slides to the new page instead of blinking between links.
  const navLink = (l: { href: string; label: string }) => (
    <Link
      key={l.href}
      href={l.href}
      className={`btn btn-ghost relative text-sm ${isActive(l.href) ? "text-ink hover:bg-transparent" : ""}`}
      aria-current={isActive(l.href) ? "page" : undefined}
    >
      {isActive(l.href) && <motion.span layoutId="nav-pill" transition={SLIDE} className="absolute inset-0 rounded-lg bg-neutral-soft" aria-hidden />}
      <span className="relative">{l.label}</span>
    </Link>
  );
  return (
    <header className="border-b border-line bg-paper/85 backdrop-blur-md sticky top-0 z-30">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight shrink-0">
          <Logo />
          <span>IntentReceipt</span>
        </Link>
        <LayoutGroup id="main-nav">
          <nav aria-label="Main" className="hidden sm:flex items-center gap-1 ml-4">
            {links.map(navLink)}
          </nav>
        </LayoutGroup>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-ink-3 hidden md:inline">Viewing as</span>
          <nav aria-label="Persona" className="flex rounded-lg border border-line bg-surface p-0.5">
            {[
              { href: "/shop", label: "Buyer", on: !merchant },
              { href: "/merchant", label: "Merchant", on: merchant },
            ].map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className={`relative px-3 py-1 rounded-md transition-colors duration-200 ${p.on ? "text-on-strong" : "text-ink-2 hover:text-ink"}`}
                aria-current={p.on ? "page" : undefined}
              >
                {p.on && <motion.span layoutId="persona-pill" transition={SLIDE} className="absolute inset-0 rounded-md bg-ink" aria-hidden />}
                <span className="relative">{p.label}</span>
              </Link>
            ))}
          </nav>
          <ThemeToggle />
        </div>
      </div>
      <LayoutGroup id="mobile-nav">
        <nav aria-label="Main (mobile)" className="sm:hidden flex gap-1 px-4 pb-2 overflow-x-auto">
          {links.map(navLink)}
        </nav>
      </LayoutGroup>
    </header>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="2.5" fill="var(--accent)" />
      <path d="M8 8h8M8 12h8M8 16h4" stroke="var(--on-strong)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="17" cy="17" r="4.2" fill="var(--paper)" stroke="var(--accent)" strokeWidth="1.6" />
      <path d="M15.3 17.1l1.2 1.2 2.2-2.4" stroke="var(--accent)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
