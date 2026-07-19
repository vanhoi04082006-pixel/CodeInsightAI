"use client";

import { motion, useScroll, useTransform, AnimatePresence, type Variants } from "framer-motion";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  Sparkles,
  Github,
  ShieldCheck,
  Gauge,
  Bug,
  Network,
  Layers,
  Brain,
  ClipboardList,
  Play,
  Hammer,
  FlaskConical,
  Rocket,
  Check,
  ChevronDown,
  Menu,
  X,
  KeyRound,
  HardDrive,
  Plug,
  Server,
  Cloud,
  Cpu,
  Code2,
  Terminal,
  GitMerge,
  Database,
  Box,
  Zap,
  Activity,
  Users,
  FileText,
  Bot,
  Twitter,
  MessageCircle,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { parseRepoUrl } from "@/lib/analysis-engine";
import { PROVIDER_PRESETS } from "@/lib/providers";
import { usePersonalizationStore } from "@/lib/personalization-store";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { AnimatedCounter } from "@/components/shared/ui";
import { useIsMobile } from "@/hooks/use-mobile";

// Lazy-load the new 3D Scene — R3F must be client-only.
const Scene3D = dynamic(
  () => import("@/components/3d/scene").then((m) => m.Scene),
  {
    ssr: false,
    loading: () => <Hero3DFallback />,
  }
);

/* ---------------------------------------------------------------
   Shared animation variants
   --------------------------------------------------------------- */
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] },
  }),
};

const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

/* ---------------------------------------------------------------
   Hero 3D loading fallback — gradient shimmer sphere
   --------------------------------------------------------------- */
function Hero3DFallback() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 animate-pulse-glow rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-cyan-400/40 to-violet-500/30" />
    </div>
  );
}

/* ---------------------------------------------------------------
   1. Cinematic Navigation — fixed top, transparent → glass on scroll
   --------------------------------------------------------------- */
function CinematicNav() {
  const setView = useAppStore((s) => s.setView);
  const { t } = useT();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { label: t("landing", "nav.features"), href: "#features" },
    { label: t("landing", "nav.howItWorks"), href: "#how-it-works" },
    { label: t("landing", "nav.pricing"), href: "#pricing" },
    { label: t("landing", "nav.faq"), href: "#faq" },
  ];

  const scrollTo = (href: string) => {
    setMobileOpen(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <header
        className="cinematic-nav fixed inset-x-0 top-0 z-50"
        data-scrolled={scrolled}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
          {/* Logo */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-2.5"
            aria-label="CodeInsight AI"
          >
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/30 to-violet-500/30 neon-border-cyan">
              <div className="absolute inset-0 rounded-xl bg-cyan-400/20 blur-md animate-pulse-glow" />
              <img src="/logo.png" alt="CodeInsight AI" className="relative h-7 w-7 rounded-lg object-contain" />
            </div>
            <div className="leading-tight">
              <span className="text-sm font-bold tracking-tight">CodeInsight</span>
              <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">AI</span>
            </div>
          </button>

          {/* Center nav */}
          <nav className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => scrollTo(link.href)}
                className="cinematic-link"
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
            <Button
              onClick={() => setView("analyze")}
              size="sm"
              className="hidden bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90 sm:flex"
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              {t("landing", "nav.launch")}
            </Button>
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] md:hidden"
              aria-label={t("landing", "nav.openMenu")}
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="cinematic-mobile-menu fixed inset-x-0 top-16 z-40 overflow-hidden md:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-4">
              {navLinks.map((link) => (
                <button
                  key={link.href}
                  onClick={() => scrollTo(link.href)}
                  className="rounded-lg px-3 py-3 text-left text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                >
                  {link.label}
                </button>
              ))}
              <Button
                onClick={() => { setMobileOpen(false); setView("analyze"); }}
                className="mt-2 bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                {t("landing", "nav.launch")}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ---------------------------------------------------------------
   2. Hero Section — SPLIT-SCREEN cinematic
   --------------------------------------------------------------- */
function HeroSection() {
  const setView = useAppStore((s) => s.setView);
  const { t } = useT();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Morph state: 0 = torus (cyan ring), 1 = sphere (green wireframe)
  // When user focuses input → morph toward sphere (0.7)
  // When user clicks Analyze → full sphere (1.0) then navigate
  const [morphState, setMorphState] = useState(0);
  const animLevel = usePersonalizationStore((s) => s.animation);

  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const threeY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const threeScale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);

  const startAnalysis = () => {
    const parsed = parseRepoUrl(url);
    if (!parsed.valid) {
      setError(t("errors", "invalidUrl"));
      return;
    }
    setError("");
    setAnalyzing(true);
    // Cinematic morph: torus → sphere → navigate
    setMorphState(1); // full sphere (green wireframe)
    setTimeout(() => setView("analyze"), 1500);
  };

  // Drive morph from input focus
  const onInputFocus = () => {
    setFocused(true);
    if (!analyzing) setMorphState(0.7); // partial morph toward sphere
  };
  const onInputBlur = () => {
    setFocused(false);
    if (!analyzing) setMorphState(0); // back to torus
  };

  const heroBadges = [
    { icon: KeyRound, label: t("landing", "hero.badgeKeys") },
    { icon: HardDrive, label: t("landing", "hero.badgeLocal") },
    { icon: Plug, label: t("landing", "hero.badgeNoSubs") },
    { icon: Cloud, label: t("landing", "hero.badgeProviders") },
  ];

  return (
    <section
      ref={heroRef}
      className="relative flex min-h-screen items-center overflow-hidden"
    >
      {/* ═══ FULL-BLEED 3D BACKGROUND ═══
          The 3D scene fills the ENTIRE hero section — no container box.
          Particles are the background, content overlays on top.
          This matches the reference video: seamless, integrated, immersive. */}
      <div className="absolute inset-0 z-0">
        <Scene3D
          morph={morphState}
          active={analyzing}
          className="h-full w-full"
        />
      </div>

      {/* Radial gradient overlay for text readability (subtle, doesn't hide 3D) */}
      <div
        className="pointer-events-none absolute inset-0 z-1"
        style={{
          background: "radial-gradient(ellipse 80% 60% at 30% 50%, rgba(5,5,7,0.85), transparent 70%)",
        }}
      />

      {/* Content overlay — sits on top of 3D */}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col justify-center px-4 py-20 md:px-6 lg:py-28">
        <motion.div
          style={{ y: contentY, opacity: contentOpacity }}
          className="max-w-2xl"
        >
          {/* Badge */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={0}
          >
            <span className="cinematic-pill">
              <span className="live-dot" />
              {t("landing", "hero.badge")}
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={1}
            className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl"
          >
            <span className="cinematic-headline-gradient">
              {t("landing", "hero.headline")}
            </span>
          </motion.h1>

          {/* Description */}
          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={2}
            className="mt-6 max-w-xl text-balance text-base text-muted-foreground md:text-lg"
          >
            {t("landing", "hero.description")}
          </motion.p>

          {/* Repo URL Input */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={3}
            className="mt-8 w-full max-w-xl"
          >
            <div
              className="cinematic-input-wrap flex flex-col gap-2 p-2 sm:flex-row sm:items-center"
              data-focused={focused}
            >
              <div className="flex flex-1 items-center gap-2 px-2">
                <Github className="h-5 w-5 shrink-0 text-cyan-300" />
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && startAnalysis()}
                  onFocus={onInputFocus}
                  onBlur={onInputBlur}
                  placeholder={t("landing", "hero.inputPlaceholder")}
                  className="border-0 bg-transparent px-1 font-mono text-sm shadow-none focus-visible:ring-0"
                  aria-label="GitHub repository URL"
                />
              </div>
              <button
                onClick={startAnalysis}
                className="cinematic-btn-primary shrink-0"
              >
                <Sparkles className="h-4 w-4" />
                {t("landing", "hero.ctaAnalyze")}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>

            {/* Try chips + error */}
            {error ? (
              <p className="mt-2 text-sm text-rose-400">{error}</p>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{t("landing", "tryLabel")}</span>
                {["vercel/next.js", "facebook/react", "vuejs/core"].map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setUrl(`https://github.com/${r}`);
                      setView("analyze");
                    }}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 font-mono transition hover:border-cyan-400/40 hover:text-cyan-300"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          {/* Secondary CTA + Live status */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={4}
            className="mt-6 flex flex-wrap items-center gap-4"
          >
            <button
              onClick={() => setView("analyze")}
              className="cinematic-btn-outline"
            >
              <Play className="h-4 w-4" />
              {t("landing", "hero.ctaDemo")}
            </button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="live-dot" />
              <span className="font-mono">{t("landing", "hero.statusReady")}</span>
            </div>
          </motion.div>

          {/* Feature badges */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={5}
            className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2"
          >
            {heroBadges.map((b) => {
              const Icon = b.icon;
              return (
                <span
                  key={b.label}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
                >
                  <Icon className="h-3.5 w-3.5 text-cyan-300" />
                  {b.label}
                </span>
              );
            })}
          </motion.div>
        </motion.div>
      </div>

      {/* HUD overlay — cyberpunk metadata (full-bleed, on top of 3D) */}
      <div className="pointer-events-none absolute inset-0 z-5 flex flex-col justify-between p-6">
        <div className="flex items-start justify-between text-[9px] font-mono uppercase tracking-wider text-cyan-300/30">
          <span>VOLUME.CORE.SYS // [88.42.010]</span>
          <span>{analyzing ? "STATUS: ANALYZING" : focused ? "STATUS: FOCUS" : "STATUS: OPTIMAL"}</span>
        </div>
        <div className="flex items-end justify-between">
          <span className="font-mono text-[9px] uppercase tracking-wider text-cyan-300/30">
            {analyzing ? "MORPH: SPHERE → GRID" : focused ? "MORPH: TORUS → SPHERE" : "MORPH: TORUS · IDLE"}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-cyan-300/30">
            60,000 PARTICLES · BLOOM ON
          </span>
        </div>
      </div>

      {/* Scroll cue */}
      <motion.button
        onClick={() => {
          const el = document.querySelector("#trust");
          if (el) el.scrollIntoView({ behavior: "smooth" });
        }}
        animate={{ y: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 text-muted-foreground"
        aria-label="Scroll down"
      >
        <ChevronDown className="h-5 w-5" />
      </motion.button>
    </section>
  );
}

/* ---------------------------------------------------------------
   3. Trust Strip — minimal marquee
   --------------------------------------------------------------- */
const TECH_LOGOS = [
  { name: "TypeScript", icon: Code2, color: "#3178c6" },
  { name: "React", icon: Cpu, color: "#22d3ee" },
  { name: "Next.js", icon: Layers, color: "#ffffff" },
  { name: "Python", icon: Code2, color: "#fbbf24" },
  { name: "Go", icon: Terminal, color: "#60a5fa" },
  { name: "Rust", icon: Cpu, color: "#fb923c" },
  { name: "Vue", icon: Layers, color: "#34d399" },
  { name: "Svelte", icon: Box, color: "#f472b6" },
];

function TrustStrip() {
  const { t } = useT();
  return (
    <section id="trust" className="relative border-y border-white/5 py-10">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <p className="text-center font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {t("landing", "trust.label")}
        </p>
        <div className="cinematic-marquee-mask mt-6 overflow-hidden">
          <div className="cinematic-marquee gap-6">
            {[...TECH_LOGOS, ...TECH_LOGOS].map((tech, i) => {
              const Icon = tech.icon;
              return (
                <div
                  key={`${tech.name}-${i}`}
                  className="flex shrink-0 items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2.5"
                  style={{ color: tech.color }}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-sm font-medium text-foreground/80">{tech.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------
   4. Stats Section — cinematic counters
   --------------------------------------------------------------- */
function StatsSection() {
  const { t } = useT();
  const stats = [
    { value: 11, suffix: "", label: t("landing", "stats.agents"), className: "cinematic-stat-cyan", icon: Bot },
    { value: 14, suffix: "", label: t("landing", "stats.providers"), className: "cinematic-stat-violet", icon: Plug },
    { value: 66, suffix: "", label: t("landing", "stats.rules"), className: "cinematic-stat-emerald", icon: ShieldCheck },
    { value: 0, suffix: "", label: t("landing", "stats.subscriptions"), className: "cinematic-stat-amber", icon: Zap },
  ];
  return (
    <section className="relative py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
          {stats.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.label}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                custom={i}
                className="cinematic-card flex flex-col items-center p-6 text-center"
              >
                <Icon className="mb-3 h-5 w-5 text-muted-foreground" />
                <div className={`text-4xl font-bold tabular-nums md:text-5xl ${s.className}`}>
                  <AnimatedCounter value={s.value} suffix={s.suffix} />
                </div>
                <p className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------
   5. Features Section — UNIQUE layouts (NOT repetitive grid)
   --------------------------------------------------------------- */

// Feature 1: Multi-Agent System (split — left: agent network viz, right: bullets)
function MultiAgentFeature() {
  const { t } = useT();
  const bullets = [
    t("landing", "feature.multiagent.bullet1"),
    t("landing", "feature.multiagent.bullet2"),
    t("landing", "feature.multiagent.bullet3"),
    t("landing", "feature.multiagent.bullet4"),
  ];
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      className="cinematic-card grid grid-cols-1 gap-8 p-6 md:p-10 lg:grid-cols-2 lg:gap-12"
    >
      {/* Left: agent network viz */}
      <div className="relative flex h-72 items-center justify-center overflow-hidden rounded-2xl border border-white/5 bg-black/30 lg:h-80">
        <AgentNetworkViz />
      </div>

      {/* Right: description + bullets */}
      <div className="flex flex-col justify-center">
        <span className="cinematic-eyebrow">{t("landing", "featuresEyebrow")}</span>
        <h3 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">
          {t("landing", "feature.multiagent.title")}
        </h3>
        <p className="mt-3 text-sm text-muted-foreground md:text-base">
          {t("landing", "feature.multiagent.desc")}
        </p>
        <ul className="mt-6 space-y-3">
          {bullets.map((b, i) => (
            <motion.li
              key={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
              className="flex items-start gap-3"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-cyan-300">
                <Check className="h-3 w-3" />
              </span>
              <span className="text-sm text-foreground/90">{b}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

// Agent network visualization — pure SVG with animated connections
function AgentNetworkViz() {
  // 11 agents positioned around a central executive
  const agents = [
    { name: "Repo", icon: Github, angle: 0, color: "#22d3ee" },
    { name: "Security", icon: ShieldCheck, angle: 32.7, color: "#f472b6" },
    { name: "Perf", icon: Gauge, angle: 65.5, color: "#34d399" },
    { name: "BugFix", icon: Bug, angle: 98.2, color: "#fbbf24" },
    { name: "Test", icon: FlaskConical, angle: 130.9, color: "#a78bfa" },
    { name: "Docs", icon: FileText, angle: 163.6, color: "#22d3ee" },
    { name: "DevOps", icon: Server, angle: 196.4, color: "#34d399" },
    { name: "Refactor", icon: Code2, angle: 229.1, color: "#fb923c" },
    { name: "PR", icon: GitMerge, angle: 261.8, color: "#a78bfa" },
    { name: "Review", icon: Check, angle: 294.5, color: "#f472b6" },
    { name: "Brain", icon: Brain, angle: 327.3, color: "#22d3ee" },
  ];
  const cx = 150, cy = 150, r = 110;
  return (
    <svg viewBox="0 0 300 300" className="h-full w-full">
      <defs>
        <radialGradient id="execGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r="60" fill="url(#execGlow)" />
      {/* Connection lines */}
      {agents.map((a, i) => {
        const rad = (a.angle * Math.PI) / 180;
        const x = cx + Math.cos(rad) * r;
        const y = cy + Math.sin(rad) * r;
        return (
          <motion.line
            key={`line-${i}`}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke={a.color}
            strokeWidth="1"
            strokeOpacity="0.3"
            initial={{ pathLength: 0, strokeOpacity: 0 }}
            whileInView={{ pathLength: 1, strokeOpacity: 0.4 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: i * 0.06 }}
          />
        );
      })}
      {/* Center executive */}
      <motion.circle
        cx={cx}
        cy={cy}
        r="14"
        fill="#22d3ee"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ repeat: Infinity, duration: 2 }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="9" fill="#050507" fontWeight="700">EX</text>
      {/* Agent nodes */}
      {agents.map((a, i) => {
        const rad = (a.angle * Math.PI) / 180;
        const x = cx + Math.cos(rad) * r;
        const y = cy + Math.sin(rad) * r;
        return (
          <motion.g
            key={`node-${i}`}
            initial={{ opacity: 0, scale: 0 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 + i * 0.05, type: "spring", stiffness: 200 }}
          >
            <circle cx={x} cy={y} r="11" fill="#0a0a0a" stroke={a.color} strokeWidth="1.5" />
            <circle cx={x} cy={y} r="3" fill={a.color} />
          </motion.g>
        );
      })}
      {/* Pulse rings traveling outward */}
      {[0, 1, 2].map((i) => (
        <motion.circle
          key={`pulse-${i}`}
          cx={cx}
          cy={cy}
          r="14"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="1"
          initial={{ r: 14, opacity: 0.6 }}
          animate={{ r: [14, 120], opacity: [0.6, 0] }}
          transition={{ repeat: Infinity, duration: 3, delay: i * 1, ease: "easeOut" }}
        />
      ))}
    </svg>
  );
}

// Feature 2: Autonomous Workflow (horizontal timeline)
function WorkflowFeature() {
  const { t } = useT();
  const steps = [
    { icon: ClipboardList, label: t("landing", "feature.workflow.plan"), desc: t("landing", "feature.workflow.planDesc"), color: "#22d3ee" },
    { icon: Play, label: t("landing", "feature.workflow.execute"), desc: t("landing", "feature.workflow.executeDesc"), color: "#a78bfa" },
    { icon: Hammer, label: t("landing", "feature.workflow.build"), desc: t("landing", "feature.workflow.buildDesc"), color: "#f472b6" },
    { icon: FlaskConical, label: t("landing", "feature.workflow.test"), desc: t("landing", "feature.workflow.testDesc"), color: "#34d399" },
    { icon: Rocket, label: t("landing", "feature.workflow.ship"), desc: t("landing", "feature.workflow.shipDesc"), color: "#fbbf24" },
  ];
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      className="cinematic-card p-6 md:p-10"
    >
      <div className="mb-8 text-center">
        <span className="cinematic-eyebrow">{t("landing", "workflowEyebrow")}</span>
        <h3 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">
          {t("landing", "feature.workflow.title")}
        </h3>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
          {t("landing", "feature.workflow.desc")}
        </p>
      </div>

      {/* Horizontal flow with connecting line */}
      <div className="relative">
        {/* Animated flow line (desktop) */}
        <div className="cinematic-flow-line absolute left-[10%] right-[10%] top-6 hidden h-px md:block" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5 md:gap-3">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.label}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i}
                className="group relative flex flex-col items-center text-center"
              >
                <div
                  className="relative z-10 mb-4 flex h-12 w-12 items-center justify-center rounded-xl border bg-black/40 transition-all duration-300 group-hover:scale-110"
                  style={{ borderColor: `${s.color}40`, boxShadow: `0 0 16px ${s.color}30` }}
                >
                  <Icon className="h-5 w-5" style={{ color: s.color }} />
                </div>
                <p className="text-sm font-semibold">{s.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
                {/* Step number */}
                <span className="mt-2 font-mono text-[10px] text-muted-foreground/50">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

// Feature 3: Deep Analysis (bento grid asymmetric)
function DeepAnalysisFeature() {
  const { t } = useT();
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
    >
      <div className="mb-8 text-center">
        <span className="cinematic-eyebrow">{t("landing", "featuresEyebrow")}</span>
        <h3 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">
          {t("landing", "feature.deep.title")}
        </h3>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
          {t("landing", "feature.deep.desc")}
        </p>
      </div>

      {/* Bento grid — asymmetric */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
        {/* Security — large */}
        <BentoCard
          className="md:col-span-4"
          icon={ShieldCheck}
          color="#f472b6"
          title={t("landing", "feature.deep.security")}
          desc={t("landing", "feature.deep.securityDesc")}
        >
          <RadialMiniChart color="#f472b6" segments={[68, 22, 10]} labels={["HIGH", "MED", "LOW"]} />
        </BentoCard>
        {/* Performance — medium */}
        <BentoCard
          className="md:col-span-2"
          icon={Gauge}
          color="#34d399"
          title={t("landing", "feature.deep.performance")}
          desc={t("landing", "feature.deep.performanceDesc")}
        >
          <BarMiniChart color="#34d399" values={[40, 65, 50, 80, 35, 70]} />
        </BentoCard>
        {/* Bugs — medium */}
        <BentoCard
          className="md:col-span-2"
          icon={Bug}
          color="#fbbf24"
          title={t("landing", "feature.deep.bugs")}
          desc={t("landing", "feature.deep.bugsDesc")}
        >
          <BarMiniChart color="#fbbf24" values={[20, 35, 55, 28, 42, 18]} />
        </BentoCard>
        {/* Architecture — large */}
        <BentoCard
          className="md:col-span-4"
          icon={Network}
          color="#22d3ee"
          title={t("landing", "feature.deep.architecture")}
          desc={t("landing", "feature.deep.architectureDesc")}
        >
          <ArchitectureMiniViz color="#22d3ee" />
        </BentoCard>
      </div>
    </motion.div>
  );
}

function BentoCard({
  className,
  icon: Icon,
  color,
  title,
  desc,
  children,
}: {
  className?: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  title: string;
  desc: string;
  children?: ReactNode;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`cinematic-card group ${className ?? ""}`}
      style={{ borderColor: `${color}20` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ background: `${color}1a`, border: `1px solid ${color}33` }}
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        <span
          className="font-mono text-[10px] uppercase tracking-wider opacity-50 transition-opacity group-hover:opacity-100"
          style={{ color }}
        >
          LIVE
        </span>
      </div>
      <h4 className="mt-4 text-lg font-semibold">{title}</h4>
      <p className="mt-1.5 text-xs text-muted-foreground">{desc}</p>
      {children && <div className="mt-4">{children}</div>}
    </motion.div>
  );
}

function RadialMiniChart({ color, segments, labels }: { color: string; segments: number[]; labels: string[] }) {
  const total = segments.reduce((a, b) => a + b, 0);
  const radius = 38;
  const circ = 2 * Math.PI * radius;
  // Pre-compute per-segment offset + length without mutating a closure variable.
  const segData = segments.reduce<
    { len: number; offset: number; color: string }[]
  >((acc, s, i) => {
    const len = (s / total) * circ;
    const cumulativeBefore = acc.reduce((sum, item) => sum + (item.len * total) / circ, 0);
    const offset = circ - (cumulativeBefore / total) * circ;
    return [...acc, {
      len,
      offset,
      color: i === 0 ? color : i === 1 ? "#a78bfa" : "#34d399",
    }];
  }, []);
  return (
    <div className="flex items-center gap-4">
      <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
        {segData.map((seg, i) => (
          <motion.circle
            key={i}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth="8"
            strokeLinecap="butt"
            strokeDasharray={`${seg.len} ${circ - seg.len}`}
            initial={{ strokeDashoffset: circ }}
            whileInView={{ strokeDashoffset: seg.offset }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, delay: i * 0.15 }}
            style={{ filter: `drop-shadow(0 0 4px ${color}80)` }}
          />
        ))}
      </svg>
      <div className="space-y-1">
        {labels.map((l, i) => (
          <div key={l} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: i === 0 ? color : i === 1 ? "#a78bfa" : "#34d399" }}
            />
            <span className="font-mono text-muted-foreground">{l}</span>
            <span className="ml-auto font-semibold tabular-nums">{segments[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarMiniChart({ color, values }: { color: string; values: number[] }) {
  const max = Math.max(...values);
  return (
    <div className="flex h-16 items-end gap-1.5">
      {values.map((v, i) => (
        <motion.div
          key={i}
          initial={{ height: 0 }}
          whileInView={{ height: `${(v / max) * 100}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 rounded-t"
          style={{ background: `linear-gradient(to top, ${color}40, ${color})`, boxShadow: `0 0 8px ${color}40` }}
        />
      ))}
    </div>
  );
}

function ArchitectureMiniViz({ color }: { color: string }) {
  const nodes = [
    { x: 20, y: 30 }, { x: 50, y: 15 }, { x: 80, y: 30 },
    { x: 30, y: 65 }, { x: 70, y: 65 }, { x: 50, y: 85 },
  ];
  const edges = [[0, 1], [1, 2], [0, 3], [2, 4], [3, 4], [3, 5], [4, 5], [0, 1]];
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-full">
      {edges.map(([a, b], i) => (
        <motion.line
          key={i}
          x1={nodes[a].x}
          y1={nodes[a].y}
          x2={nodes[b].x}
          y2={nodes[b].y}
          stroke={color}
          strokeWidth="0.5"
          strokeOpacity="0.4"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: i * 0.08 }}
        />
      ))}
      {nodes.map((n, i) => (
        <motion.circle
          key={i}
          cx={n.x}
          cy={n.y}
          r="3"
          fill={color}
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 + i * 0.08, type: "spring", stiffness: 200 }}
          style={{ filter: `drop-shadow(0 0 3px ${color})` }}
        />
      ))}
    </svg>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="relative py-24">
      <div className="mx-auto max-w-7xl space-y-8 px-4 md:px-6">
        <MultiAgentFeature />
        <WorkflowFeature />
        <DeepAnalysisFeature />
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------
   6. How It Works — vertical storytelling (alternating sides)
   --------------------------------------------------------------- */
function HowItWorksSection() {
  const { t } = useT();
  const steps = [
    {
      n: "01",
      title: t("landing", "how.step1.title"),
      desc: t("landing", "how.step1.desc"),
      icon: Github,
      color: "#22d3ee",
      viz: <InputViz />,
    },
    {
      n: "02",
      title: t("landing", "how.step2.title"),
      desc: t("landing", "how.step2.desc"),
      icon: Network,
      color: "#a78bfa",
      viz: <AgentNetworkViz />,
    },
    {
      n: "03",
      title: t("landing", "how.step3.title"),
      desc: t("landing", "how.step3.desc"),
      icon: Rocket,
      color: "#34d399",
      viz: <DashboardPreviewViz />,
    },
  ];
  return (
    <section id="how-it-works" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mb-16 text-center"
        >
          <motion.span variants={fadeUp} className="cinematic-eyebrow">
            {t("landing", "workflowEyebrow")}
          </motion.span>
          <motion.h2
            variants={fadeUp}
            className="mt-3 text-3xl font-bold tracking-tight md:text-5xl"
          >
            {t("landing", "workflowTitle")}
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground md:text-base"
          >
            {t("landing", "workflowDesc")}
          </motion.p>
        </motion.div>

        <div className="space-y-8">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const reversed = i % 2 === 1;
            return (
              <motion.div
                key={s.n}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                className="cinematic-card grid grid-cols-1 items-center gap-8 p-6 md:p-10 lg:grid-cols-2 lg:gap-12"
              >
                {/* Text side */}
                <div className={`flex flex-col justify-center ${reversed ? "lg:order-2" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-4xl font-bold text-white/10">{s.n}</span>
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ background: `${s.color}1a`, border: `1px solid ${s.color}33` }}
                    >
                      <Icon className="h-5 w-5" style={{ color: s.color }} />
                    </div>
                  </div>
                  <h3 className="mt-4 text-2xl font-bold tracking-tight md:text-3xl">{s.title}</h3>
                  <p className="mt-3 text-sm text-muted-foreground md:text-base">{s.desc}</p>
                </div>
                {/* Viz side */}
                <div
                  className={`relative flex h-64 items-center justify-center overflow-hidden rounded-2xl border border-white/5 bg-black/30 lg:h-80 ${reversed ? "lg:order-1" : ""}`}
                >
                  {s.viz}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function InputViz() {
  return (
    <div className="w-full max-w-sm space-y-3 p-4">
      <div className="cinematic-input-wrap flex items-center gap-2 px-3 py-2.5" data-focused="true">
        <Github className="h-4 w-4 text-cyan-300" />
        <motion.span
          className="font-mono text-sm text-foreground"
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ repeat: Infinity, duration: 1.2 }}
        >
          github.com/vercel/next.js
          <motion.span
            className="ml-0.5 inline-block h-4 w-px align-middle bg-cyan-300"
            animate={{ opacity: [1, 0, 1] }}
            transition={{ repeat: Infinity, duration: 1 }}
          />
        </motion.span>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, repeat: Infinity, repeatType: "reverse", repeatDelay: 1.5, duration: 0.6 }}
        className="cinematic-btn-primary w-fit"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Analyze Repo
      </motion.div>
      <div className="space-y-1.5 pt-2 font-mono text-xs text-muted-foreground">
        {["→ Cloning repository…", "→ Parsing AST…", "→ Building dependency graph…"].map((line, i) => (
          <motion.div
            key={line}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 + i * 0.3, duration: 0.4 }}
            className="flex items-center gap-2"
          >
            <span className="text-cyan-300">›</span>
            {line}
            <Check className="ml-auto h-3 w-3 text-emerald-400" />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function DashboardPreviewViz() {
  return (
    <div className="w-full max-w-sm space-y-2 p-4 font-mono text-xs">
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <span className="text-cyan-300">vercel/next.js</span>
        <span className="flex items-center gap-1 text-emerald-400">
          <span className="live-dot" /> ANALYZED
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[
          { l: "SEC", v: 92, c: "#34d399" },
          { l: "PERF", v: 78, c: "#22d3ee" },
          { l: "BUGS", v: 85, c: "#a78bfa" },
          { l: "ARCH", v: 88, c: "#fbbf24" },
        ].map((s) => (
          <div key={s.l} className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-center">
            <div className="text-[9px] text-muted-foreground">{s.l}</div>
            <motion.div
              className="text-lg font-bold tabular-nums"
              style={{ color: s.c }}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              {s.v}
            </motion.div>
          </div>
        ))}
      </div>
      <div className="space-y-1 pt-2">
        {["2 critical issues found", "5 performance bottlenecks", "Dependency graph ready"].map((l, i) => (
          <motion.div
            key={l}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 + i * 0.15 }}
            className="flex items-center gap-2 text-[11px] text-muted-foreground"
          >
            <span className="text-cyan-300">›</span>
            {l}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   7. Provider Grid — dark cards
   --------------------------------------------------------------- */
function ProviderGrid() {
  const setView = useAppStore((s) => s.setView);
  const { t } = useT();
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mb-12 text-center"
        >
          <motion.span variants={fadeUp} className="cinematic-eyebrow">
            {t("landing", "providersEyebrow")}
          </motion.span>
          <motion.h2
            variants={fadeUp}
            className="mt-3 text-3xl font-bold tracking-tight md:text-5xl"
          >
            {t("landing", "providersTitle")}
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground md:text-base"
          >
            {t("landing", "providersDesc")}
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {PROVIDER_PRESETS.map((p, i) => {
            const Icon = p.local ? HardDrive : p.category === "Aggregator" ? Server : Cloud;
            return (
              <motion.button
                key={p.providerId}
                onClick={() => setView("providers")}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="cinematic-card group flex items-center gap-3 p-3 text-left"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: `${p.accent}1a`, color: p.accent, border: `1px solid ${p.accent}33` }}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{p.category}</p>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-cyan-300 opacity-0 transition-opacity group-hover:opacity-100">
                  {t("landing", "providers.connect")}
                </span>
              </motion.button>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <Button onClick={() => setView("providers")} variant="outline">
            <Plug className="mr-1.5 h-4 w-4" />
            {t("landing", "providers.viewAll")}
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------
   8. Pricing — 3 tiers, middle highlighted
   --------------------------------------------------------------- */
function PricingSection() {
  const setView = useAppStore((s) => s.setView);
  const { t } = useT();

  const tiers = [
    {
      name: t("landing", "pricing.free"),
      price: t("landing", "pricing.freePrice"),
      desc: t("landing", "pricing.freeDesc"),
      features: [
        t("landing", "pricing.freeF1"),
        t("landing", "pricing.freeF2"),
        t("landing", "pricing.freeF3"),
        t("landing", "pricing.freeF4"),
      ],
      popular: false,
      color: "#22d3ee",
    },
    {
      name: t("landing", "pricing.pro"),
      price: t("landing", "pricing.proPrice"),
      desc: t("landing", "pricing.proDesc"),
      features: [
        t("landing", "pricing.proF1"),
        t("landing", "pricing.proF2"),
        t("landing", "pricing.proF3"),
        t("landing", "pricing.proF4"),
        t("landing", "pricing.proF5"),
      ],
      popular: true,
      color: "#a78bfa",
    },
    {
      name: t("landing", "pricing.enterprise"),
      price: t("landing", "pricing.enterprisePrice"),
      desc: t("landing", "pricing.enterpriseDesc"),
      features: [
        t("landing", "pricing.enterpriseF1"),
        t("landing", "pricing.enterpriseF2"),
        t("landing", "pricing.enterpriseF3"),
        t("landing", "pricing.enterpriseF4"),
      ],
      popular: false,
      color: "#34d399",
    },
  ];

  return (
    <section id="pricing" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mb-12 text-center"
        >
          <motion.span variants={fadeUp} className="cinematic-eyebrow">
            {t("landing", "nav.pricing")}
          </motion.span>
          <motion.h2
            variants={fadeUp}
            className="mt-3 text-3xl font-bold tracking-tight md:text-5xl"
          >
            {t("landing", "pricing.title")}
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground md:text-base"
          >
            {t("landing", "pricing.desc")}
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {tiers.map((tier, i) => (
            <motion.div
              key={tier.name}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
              className={`cinematic-card relative flex flex-col p-8 ${tier.popular ? "cinematic-card-popular" : ""}`}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-3 py-1 font-mono text-[10px] font-bold tracking-wider text-black">
                    {t("landing", "pricing.popular")}
                  </span>
                </div>
              )}
              <h3 className="text-lg font-semibold" style={{ color: tier.color }}>
                {tier.name}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">{tier.desc}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-bold tabular-nums">{tier.price}</span>
                <span className="text-xs text-muted-foreground">/ forever</span>
              </div>
              <ul className="mt-6 flex-1 space-y-3">
                {tier.features.map((f, j) => (
                  <li key={j} className="flex items-start gap-2.5 text-sm">
                    <span
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                      style={{ background: `${tier.color}1a`, color: tier.color }}
                    >
                      <Check className="h-2.5 w-2.5" />
                    </span>
                    <span className="text-foreground/90">{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setView("analyze")}
                className={tier.popular ? "cinematic-btn-primary mt-8 w-full" : "cinematic-btn-outline mt-8 w-full"}
              >
                {t("landing", "pricing.getStarted")}
                <ArrowRight className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------
   9. FAQ — accordion, minimal
   --------------------------------------------------------------- */
function FAQSection() {
  const { t } = useT();
  const faqKeys = ["faqQ1", "faqQ2", "faqQ3", "faqQ4", "faqQ5", "faqQ6"];
  return (
    <section id="faq" className="relative py-24">
      <div className="mx-auto max-w-3xl px-4 md:px-6">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mb-10 text-center"
        >
          <motion.span variants={fadeUp} className="cinematic-eyebrow">
            {t("landing", "faqEyebrow")}
          </motion.span>
          <motion.h2
            variants={fadeUp}
            className="mt-3 text-3xl font-bold tracking-tight md:text-5xl"
          >
            {t("landing", "faqTitle")}
          </motion.h2>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="cinematic-card p-2"
        >
          <Accordion type="single" collapsible className="w-full">
            {faqKeys.map((qk, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-white/5">
                <AccordionTrigger className="px-4 text-left hover:no-underline">
                  <span className="text-sm font-medium">{t("landing", qk)}</span>
                </AccordionTrigger>
                <AccordionContent className="px-4 text-sm text-muted-foreground">
                  {t("landing", `faqA${i + 1}`)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------
   10. Final CTA — full-width, dramatic
   --------------------------------------------------------------- */
function FinalCTA() {
  const setView = useAppStore((s) => s.setView);
  const { t } = useT();
  return (
    <section className="relative overflow-hidden py-32">
      <div className="cinematic-cta-bg absolute inset-0" />
      {/* Particle-like dots */}
      <div className="absolute inset-0 opacity-30">
        {Array.from({ length: 30 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-1 w-1 rounded-full bg-cyan-300"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{ opacity: [0, 1, 0], scale: [0.5, 1.5, 0.5] }}
            transition={{
              repeat: Infinity,
              duration: 2 + Math.random() * 3,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      <div className="relative mx-auto max-w-4xl px-4 text-center md:px-6">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <motion.span variants={fadeUp} className="cinematic-pill">
            <Star className="h-3 w-3" />
            {t("landing", "hero.badge")}
          </motion.span>
          <motion.h2
            variants={fadeUp}
            className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl"
          >
            <span className="cinematic-headline-gradient">
              {t("landing", "finalCta.title")}
            </span>
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mx-auto mt-6 max-w-2xl text-balance text-base text-muted-foreground md:text-lg"
          >
            {t("landing", "finalCta.desc")}
          </motion.p>
          <motion.div variants={fadeUp} className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              onClick={() => setView("analyze")}
              className="cinematic-btn-primary animate-pulse-glow"
            >
              <Rocket className="h-4 w-4" />
              {t("landing", "finalCta.button")}
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("providers")}
              className="cinematic-btn-outline"
            >
              <Plug className="h-4 w-4" />
              {t("landing", "ctaConnect")}
            </button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------
   11. Footer — minimal, dark
   --------------------------------------------------------------- */
function CinematicFooter() {
  const setView = useAppStore((s) => s.setView);
  const { t } = useT();

  const cols = [
    {
      title: t("landing", "footer.product"),
      links: [
        { label: t("landing", "footer.productFeatures"), onClick: () => {
          const el = document.querySelector("#features");
          if (el) el.scrollIntoView({ behavior: "smooth" });
        } },
        { label: t("landing", "footer.productProviders"), onClick: () => setView("providers") },
        { label: t("landing", "footer.productPricing"), onClick: () => {
          const el = document.querySelector("#pricing");
          if (el) el.scrollIntoView({ behavior: "smooth" });
        } },
        { label: t("landing", "footer.productDashboard"), onClick: () => setView("dashboard") },
      ],
    },
    {
      title: t("landing", "footer.resources"),
      links: [
        { label: t("landing", "footer.resourcesDocs"), onClick: () => setView("settings") },
        { label: t("landing", "footer.resourcesApi"), onClick: () => setView("settings") },
        { label: t("landing", "footer.resourcesChangelog"), onClick: () => setView("history") },
        { label: t("landing", "footer.resourcesStatus"), onClick: () => setView("dashboard") },
      ],
    },
    {
      title: t("landing", "footer.company"),
      links: [
        { label: t("landing", "footer.companyAbout"), onClick: () => setView("landing") },
        { label: t("landing", "footer.companyBlog"), onClick: () => setView("history") },
        { label: t("landing", "footer.companyCareers"), onClick: () => setView("landing") },
        { label: t("landing", "footer.companyContact"), onClick: () => setView("settings") },
      ],
    },
    {
      title: t("landing", "footer.legal"),
      links: [
        { label: t("landing", "footer.legalPrivacy"), onClick: () => setView("settings") },
        { label: t("landing", "footer.legalTerms"), onClick: () => setView("settings") },
        { label: t("landing", "footer.legalSecurity"), onClick: () => setView("settings") },
        { label: t("landing", "footer.legalLicense"), onClick: () => setView("settings") },
      ],
    },
  ];

  const socials = [
    { icon: Github, label: "GitHub" },
    { icon: Twitter, label: "Twitter" },
    { icon: MessageCircle, label: "Discord" },
  ];

  return (
    <footer className="relative border-t border-white/5 bg-black/40 py-12 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-6">
          {/* Brand */}
          <div className="col-span-2">
            <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-2.5">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/30 to-violet-500/30 neon-border-cyan">
                <img src="/logo.png" alt="CodeInsight AI" className="relative h-7 w-7 rounded-lg object-contain" />
              </div>
              <div className="leading-tight">
                <span className="text-sm font-bold">CodeInsight</span>
                <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">AI</span>
              </div>
            </button>
            <p className="mt-4 max-w-xs text-xs text-muted-foreground">
              {t("landing", "footer.tagline")}
            </p>
            <div className="mt-4 flex items-center gap-2">
              {socials.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.label}
                    aria-label={s.label}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-muted-foreground transition hover:border-cyan-400/40 hover:text-cyan-300"
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Link columns */}
          {cols.map((col) => (
            <div key={col.title}>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {col.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <button
                      onClick={link.onClick}
                      className="cinematic-footer-link"
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="cinematic-divider mt-10" />

        <div className="mt-6 flex flex-col items-center justify-between gap-3 md:flex-row">
          <p className="text-xs text-muted-foreground">{t("landing", "footer.copyright")}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Activity className="h-3 w-3 text-emerald-400" />
            All systems operational
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ---------------------------------------------------------------
   Main Landing View — assembles all sections
   --------------------------------------------------------------- */
export function LandingView() {
  const { t } = useT();
  return (
    <div className="cinematic-bg relative min-h-screen overflow-x-hidden">
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-cyan-500/5 blur-[120px]" />
        <div className="absolute right-1/4 top-1/2 h-96 w-96 rounded-full bg-violet-500/5 blur-[120px]" />
      </div>

      <CinematicNav />

      <main className="relative z-10">
        <HeroSection />
        <TrustStrip />
        <StatsSection />
        <FeaturesSection />
        <HowItWorksSection />
        <ProviderGrid />
        <PricingSection />
        <FAQSection />
        <FinalCTA />
      </main>

      <CinematicFooter />

      {/* SR-only heading for accessibility */}
      <h1 className="sr-only">{t("landing", "hero.headline")}</h1>
    </div>
  );
}
