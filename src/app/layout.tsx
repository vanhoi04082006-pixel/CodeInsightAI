import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Toaster as HotToaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CodeInsight AI — Paste a GitHub Repo. AI Understands Everything.",
  description:
    "AI-powered GitHub repository analysis platform. Clone, scan, analyse, and chat with any codebase. Acts like your Senior Staff Engineer, Security Expert, and CTO combined.",
  keywords: [
    "CodeInsight AI",
    "GitHub analysis",
    "AI code review",
    "repository intelligence",
    "architecture analysis",
    "security audit",
    "performance analysis",
  ],
  authors: [{ name: "CodeInsight AI" }],
  icons: { icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg" },
  openGraph: {
    title: "CodeInsight AI",
    description: "Paste a GitHub Repository. AI Understands Everything.",
    siteName: "CodeInsight AI",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {/* SVG color-blind correction filters (referenced by CSS url(#cb-*)) */}
        <svg width="0" height="0" className="absolute" aria-hidden>
          <defs>
            <filter id="cb-protanopia">
              <feColorMatrix type="matrix" values="0.567 0.433 0 0 0 0.558 0.442 0 0 0 0 0.242 0.758 0 0 0 0 0 1 0" />
            </filter>
            <filter id="cb-deuteranopia">
              <feColorMatrix type="matrix" values="0.625 0.375 0 0 0 0.7 0.3 0 0 0 0 0.3 0.7 0 0 0 0 0 1 0" />
            </filter>
            <filter id="cb-tritanopia">
              <feColorMatrix type="matrix" values="0.95 0.05 0 0 0 0 0.433 0.567 0 0 0 0.475 0.525 0 0 0 0 0 1 0" />
            </filter>
          </defs>
        </svg>
        <Providers>
          {children}
          <Toaster />
          <HotToaster />
        </Providers>
      </body>
    </html>
  );
}
