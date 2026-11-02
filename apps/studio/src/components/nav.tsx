"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { gabarito } from "@/lib/fonts";

const LINKS = [
  { href: "/", label: "Oluştur" },
  { href: "/compare", label: "Karşılaştır" },
  { href: "/video", label: "Video" },
  { href: "/video/editor", label: "Editör" },
  { href: "/voice", label: "Seslendirme" },
  { href: "/debug", label: "Hatalar" },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname === "/login") return null;

  return (
    <header className="border-border/60 sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" onClick={() => setOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- yerel SVG, next/image gereksiz */}
          <img src="/icon.svg" alt="" width={24} height={24} className="size-6 rounded-md" />
          <span className={`text-lg font-bold tracking-tight sm:text-xl ${gabarito.className}`}>IGOR</span>
        </Link>

        <nav className="bg-muted hidden max-w-full items-center gap-1 overflow-x-auto rounded-full p-1 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors sm:px-4 sm:text-sm",
                pathname === link.href
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
          aria-expanded={open}
          className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-full p-2 transition-colors md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <nav className="border-border/60 flex flex-col gap-1 border-t px-4 py-3 md:hidden">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                pathname === link.href
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
