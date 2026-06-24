import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "shAIpe — Your AI fitting room",
  description:
    "See how clothes look on you before you buy. Upload yourself, drop in clothing, and get realistic try-on previews with fit and sizing guidance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <footer className="border-t py-6 text-center text-xs text-muted-foreground">
          shAIpe generates approximate visual previews. Results may not perfectly represent
          real-world fit, sizing, fabric behavior, or appearance. Always check the retailer&apos;s
          official sizing chart before purchasing.
        </footer>
      </body>
    </html>
  );
}
