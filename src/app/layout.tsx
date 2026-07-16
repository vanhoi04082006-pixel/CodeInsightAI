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
      <head>
        {/*
          SSR-safe i18n + theme initialization script.
          Runs BEFORE React hydrates to prevent language/theme mismatch.

          1. Reads the language cookie (set by LanguageSwitcher).
          2. Reads the personalization localStorage (theme, accent, etc.).
          3. Applies the correct <html> class + lang attribute synchronously.

          This guarantees the server-rendered HTML and the first client render
          produce identical output — no hydration mismatch.
        */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              // --- Language ---
              var lang = 'en';
              var m = document.cookie.match(/codeinsight-lang=([^;]+)/);
              if (m && (m[1] === 'en' || m[1] === 'vi')) {
                lang = m[1];
              } else {
                var bl = (navigator.language || 'en').toLowerCase();
                if (bl.indexOf('vi') === 0) lang = 'vi';
              }
              document.documentElement.lang = lang;

              // --- Theme (from personalization localStorage) ---
              var pRaw = localStorage.getItem('codeinsight-ai-personalization');
              var p = pRaw ? JSON.parse(pRaw) : null;
              var theme = p && p.state ? p.state.theme : 'system';
              var resolved = theme;
              if (theme === 'system') {
                resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
              }
              var root = document.documentElement;
              root.classList.toggle('dark', resolved === 'dark');
              root.classList.toggle('light', resolved === 'light');
              root.dataset.theme = resolved;

              // --- Accent color ---
              var accent = p && p.state ? p.state.accent : 'blue';
              var palettes = {
                blue: ['#3b82f6','#60a5fa','#3b82f6','rgba(59,130,246,0.45)'],
                purple: ['#a855f7','#c084fc','#a855f7','rgba(168,85,247,0.45)'],
                emerald: ['#10b981','#34d399','#10b981','rgba(16,185,129,0.45)'],
                cyan: ['#06b6d4','#22d3ee','#06b6d4','rgba(6,182,212,0.45)'],
                orange: ['#f97316','#fb923c','#f97316','rgba(249,115,22,0.45)'],
                rose: ['#f43f5e','#fb7185','#f43f5e','rgba(244,63,94,0.45)'],
                red: ['#ef4444','#f87171','#ef4444','rgba(239,68,68,0.45)'],
                indigo: ['#6366f1','#818cf8','#6366f1','rgba(99,102,241,0.45)'],
                slate: ['#64748b','#94a3b8','#64748b','rgba(100,116,139,0.45)']
              };
              var pal = palettes[accent] || palettes.blue;
              root.style.setProperty('--accent-primary', pal[0]);
              root.style.setProperty('--accent-accent', pal[1]);
              root.style.setProperty('--accent-ring', pal[2]);
              root.style.setProperty('--accent-glow', pal[3]);
              root.dataset.accent = accent;

              // --- Font size ---
              var fs = p && p.state ? p.state.fontSize : 'base';
              root.style.fontSize = fs === 'sm' ? '14px' : fs === 'lg' ? '18px' : '16px';

              // --- Accessibility ---
              if (p && p.state) {
                root.classList.toggle('reduce-motion', !!p.state.reducedMotion);
                root.classList.toggle('high-contrast', !!p.state.highContrast);
                root.dataset.colorBlind = p.state.colorBlind || 'none';
                root.dataset.animation = p.state.animation || 'ultra';
                root.dataset.density = p.state.density || 'comfortable';
              }
            } catch (e) { /* fail silently — React will handle defaults */ }
          })();
        ` }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
        suppressHydrationWarning
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
