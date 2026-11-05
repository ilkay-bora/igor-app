"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bug, Clapperboard, Columns2, Film, Menu, Mic, Settings, Sparkles, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { gabarito } from "@/lib/fonts";
import { currentLang, t } from "@/lib/i18n";
import { changeLanguage } from "@/components/language-provider";

type NavLink = { href: string; label: string; icon: LucideIcon };

// Main flow first: create, then edit. Utility pages sit on the right as icons.
const LINKS: NavLink[] = [
  { href: "/", label: "Oluştur", icon: Sparkles },
  { href: "/video/editor", label: "Editör", icon: Clapperboard },
  { href: "/video", label: "Video", icon: Film },
  { href: "/voice", label: "Seslendirme", icon: Mic },
  { href: "/compare", label: "Karşılaştır", icon: Columns2 },
];

const UTILITY_LINKS: NavLink[] = [
  { href: "/debug", label: "Hatalar", icon: Bug },
  { href: "/settings", label: "Ayarlar", icon: Settings },
];

// TR/EN toggle; the choice is saved in settings and the page reloads.
function LanguageSwitch() {
  const lang = currentLang();
  return (
    <button
      type="button"
      onClick={() => changeLanguage(lang === "tr" ? "en" : "tr")}
      title={t("Dili değiştir")}
      aria-label={t("Dili değiştir")}
      className="text-muted-foreground hover:bg-muted/70 hover:text-foreground flex h-9 items-center gap-0.5 rounded-md px-2 text-xs font-semibold tracking-wide transition-colors"
    >
      <span className={lang === "tr" ? "text-foreground" : undefined}>TR</span>
      <span className="opacity-40">/</span>
      <span className={lang === "en" ? "text-foreground" : undefined}>EN</span>
    </button>
  );
}

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname === "/login" || pathname === "/setup") return null;

  return (
    <header className="border-border/70 bg-background/85 sticky top-0 z-20 h-14 border-b backdrop-blur">
      <div className="mx-auto flex h-full w-full max-w-[1800px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center" onClick={() => setOpen(false)}>
          <span className={`text-xl leading-none font-black tracking-tight uppercase ${gabarito.className}`}>{t("IGOR")}</span>
        </Link>

        <nav className="hidden h-full items-stretch gap-1 md:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center text-sm font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="group-hover:bg-muted/70 flex items-center gap-2 rounded-md px-3 py-1.5 transition-colors">
                  <Icon className={cn("size-4", active && "text-primary")} />
                  {t(link.label)}
                </span>
                <span
                  className={cn(
                    "bg-primary absolute inset-x-3 -bottom-px h-0.5 rounded-full transition-opacity",
                    active ? "opacity-100" : "opacity-0"
                  )}
                />
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden items-center gap-1 md:flex">
          <LanguageSwitch />
          {UTILITY_LINKS.map((link) => {
            const active = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                title={t(link.label)}
                aria-label={t(link.label)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex size-9 items-center justify-center rounded-md transition-colors",
                  active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                )}
              >
                <Icon className="size-[18px]" />
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? t("Menüyü kapat") : t("Menüyü aç")}
          aria-expanded={open}
          className="text-muted-foreground hover:bg-muted hover:text-foreground ml-auto rounded-md p-2 transition-colors md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <nav className="border-border/70 bg-background flex flex-col gap-1 border-b px-4 py-3 md:hidden">
          {[...LINKS, ...UTILITY_LINKS].map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                {t(link.label)}
              </Link>
            );
          })}
          <div className="px-3 py-2">
            <LanguageSwitch />
          </div>
        </nav>
      )}
    </header>
  );
}
