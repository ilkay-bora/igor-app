import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Nav } from "@/components/nav";
import { SetupGate } from "@/components/setup-gate";
import { LanguageProvider } from "@/components/language-provider";
import { serverLang, tServer } from "@/lib/i18n-server";
import "./globals.css";

// The UI language is a saved setting, read on every request.
export const dynamic = "force-dynamic";

const inter = Inter({
  variable: "--font-sans",
  // latin-ext carries Turkish ğ, ş, ı, İ.
  subsets: ["latin", "latin-ext"],
});

export function generateMetadata(): Metadata {
  return {
    title: "IGOR",
    description: tServer("Agent'ların da kullanabildiği lokal AI video editörü ve medya stüdyosu"),
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  const lang = serverLang();
  return (
    <html lang={lang} className={`dark ${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <LanguageProvider lang={lang}>
          <div className="igor-ambient" aria-hidden="true" />
          <SetupGate />
          <Nav />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
