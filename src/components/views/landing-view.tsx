"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  Bot,
  ShieldCheck,
  Gauge,
  Network,
  Bug,
  Sparkles,
  Brain,
  FileText,
  Zap,
  Check,
  ChevronDown,
  Github,
  ScanSearch,
  Lock,
  Rocket,
  Code2,
  Database,
  Cloud,
  Cpu,
  Terminal,
  Layers,
  GitMerge,
  Plug,
  KeyRound,
  HardDrive,
  Server,
} from "lucide-react";
import { GlassCard, SectionTitle, GradientText, NeonDivider, AnimatedCounter } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { parseRepoUrl } from "@/lib/analysis-engine";
import { PROVIDER_PRESETS } from "@/lib/providers";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FEATURES = [
  { icon: Brain, titleKey: "feature1Title", descKey: "feature1Desc", color: "#22d3ee" },
  { icon: Network, titleKey: "feature2Title", descKey: "feature2Desc", color: "#a78bfa" },
  { icon: ShieldCheck, titleKey: "feature3Title", descKey: "feature3Desc", color: "#f472b6" },
  { icon: Gauge, titleKey: "feature4Title", descKey: "feature4Desc", color: "#34d399" },
  { icon: Bug, titleKey: "feature5Title", descKey: "feature5Desc", color: "#fbbf24" },
  { icon: FileText, titleKey: "feature6Title", descKey: "feature6Desc", color: "#60a5fa" },
];

const TECH_LOGOS = [
  { name: "TypeScript", icon: Code2, color: "#3178c6" },
  { name: "React", icon: Cpu, color: "#22d3ee" },
  { name: "Next.js", icon: Layers, color: "#ffffff" },
  { name: "Node.js", icon: Terminal, color: "#34d399" },
  { name: "Python", icon: Code2, color: "#fbbf24" },
  { name: "Go", icon: Cpu, color: "#60a5fa" },
  { name: "Rust", icon: Network, color: "#fb923c" },
  { name: "Vue", icon: Layers, color: "#34d399" },
  { name: "PostgreSQL", icon: Database, color: "#60a5fa" },
  { name: "Docker", icon: Layers, color: "#22d3ee" },
  { name: "AWS", icon: Cloud, color: "#fbbf24" },
  { name: "GraphQL", icon: GitMerge, color: "#f472b6" },
];

const STEPS = [
  { n: "01", titleKey: "step1Title", descKey: "step1Desc", icon: Plug },
  { n: "02", titleKey: "step2Title", descKey: "step2Desc", icon: Github },
  { n: "03", titleKey: "step3Title", descKey: "step3Desc", icon: ScanSearch },
];

const LOCAL_PRINCIPLES = [
  { icon: KeyRound, titleKey: "principleKeys", descKey: "principleKeysDesc", color: "#22d3ee" },
  { icon: HardDrive, titleKey: "principleData", descKey: "principleDataDesc", color: "#34d399" },
  { icon: Plug, titleKey: "principleNoSub", descKey: "principleNoSubDesc", color: "#a78bfa" },
  { icon: Server, titleKey: "principleLocal", descKey: "principleLocalDesc", color: "#fbbf24" },
];

const FEATURE_ROUTING = [
  { feature: "Bug Detection", model: "Claude 3.5 Sonnet", color: "#d97706" },
  { feature: "Repository Chat", model: "GPT-4o", color: "#10a37f" },
  { feature: "Documentation", model: "DeepSeek Coder", color: "#4d6bfe" },
  { feature: "Vision / Images", model: "Gemini 1.5 Pro", color: "#4285f4" },
  { feature: "Refactoring", model: "Qwen 2.5 72B", color: "#8b5cf6" },
  { feature: "Security Audit", model: "Claude 3.5 Sonnet", color: "#d97706" },
];

const FAQ_KEYS = ["faqQ1", "faqQ2", "faqQ3", "faqQ4", "faqQ5", "faqQ6"];

export function LandingView() {
  const setView = useAppStore((s) => s.setView);
  const { t } = useT();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, -80]);

  const startAnalysis = () => {
    const parsed = parseRepoUrl(url);
    if (!parsed.valid) {
      setError(t("errors", "invalidUrl"));
      return;
    }
    setError("");
    setView("analyze");
  };

  return (
    <div className="relative">
      {/* ============ HERO ============ */}
      <section className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-16">
        <div className="pointer-events-none absolute inset-0 -z-0 flex items-center justify-center">
          {/* 3D AI Core removed */}
        </div>

        <motion.div
          style={{ y: heroY }}
          className="relative z-10 flex flex-col items-center text-center"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs backdrop-blur-md"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
            <span className="text-muted-foreground">{t("landing", "heroBadge")}</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05 }}
            className="max-w-4xl text-balance text-5xl font-bold tracking-tight md:text-7xl"
          >
            {t("landing", "heroTitle1")}
            <br />
            <GradientText>{t("landing", "heroTitle2")}</GradientText>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="mt-6 max-w-2xl text-balance text-base text-muted-foreground md:text-xl"
          >
            {t("landing", "heroSubtitle")}
          </motion.p>

          {/* URL input */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="mt-10 w-full max-w-2xl"
          >
            <div className="gradient-border flex flex-col gap-2 rounded-2xl p-2 sm:flex-row sm:items-center">
              <div className="flex flex-1 items-center gap-2 px-3">
                <Github className="h-5 w-5 shrink-0 text-cyan-300" />
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && startAnalysis()}
                  placeholder="https://github.com/vercel/next.js"
                  className="border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0"
                />
              </div>
              <Button
                onClick={startAnalysis}
                size="lg"
                className="group bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                Analyze Repo
                <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </div>
            {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
              <span>{t("landing", "tryLabel")}</span>
              {["vercel/next.js", "facebook/react", "vuejs/core"].map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setUrl(`https://github.com/${r}`);
                    setView("analyze");
                  }}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 transition hover:border-cyan-400/40 hover:text-cyan-300"
                >
                  {r}
                </button>
              ))}
            </div>
          </motion.div>

          {/* trust strip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs text-muted-foreground"
          >
            <span className="flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> {t("landing", "trustPrivate")}</span>
            <span className="flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5" /> {t("landing", "trustData")}</span>
            <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> {t("landing", "trustFast")}</span>
            <span className="flex items-center gap-1.5"><Plug className="h-3.5 w-3.5" /> {t("landing", "trustProviders")}</span>
          </motion.div>
        </motion.div>

        {/* scroll cue */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute bottom-6 text-muted-foreground"
        >
          <ChevronDown className="h-5 w-5" />
        </motion.div>
      </section>

      {/* ============ STATS BAR ============ */}
      <section className="relative px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { value: 14, suffix: "", label: t("landing", "statsProviders"), color: "#22d3ee" },
              { value: 40, suffix: "+", label: t("landing", "statsLanguages"), color: "#a78bfa" },
              { value: 0, suffix: "", label: t("landing", "statsSubscriptions"), color: "#34d399" },
              { value: 60, suffix: "s", label: t("landing", "statsAvg"), color: "#fbbf24" },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="text-center"
              >
                <div
                  className="text-3xl font-bold md:text-4xl"
                  style={{ color: s.color, textShadow: `0 0 20px ${s.color}40` }}
                >
                  <AnimatedCounter value={s.value} suffix={s.suffix} />
                </div>
                <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ TECH MARQUEE ============ */}
      <section className="relative overflow-hidden py-8">
        <p className="mb-5 text-center text-xs uppercase tracking-[0.25em] text-muted-foreground">
          {t("landing", "marqueeTitle")}
        </p>
        <div className="relative mask-fade-x">
          <div className="flex w-max gap-4 animate-[marquee_30s_linear_infinite]">
            {[...TECH_LOGOS, ...TECH_LOGOS].map((tech, i) => {
              const Icon = tech.icon;
              return (
                <div
                  key={i}
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
      </section>

      {/* ============ LOCAL-FIRST PRINCIPLES ============ */}
      <section className="relative px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <SectionTitle
            center
            eyebrow={t("landing", "principlesEyebrow")}
            title={<>Your keys. Your data. <GradientText>Your AI.</GradientText></>}
            description={t("landing", "principlesDesc")}
          />
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {LOCAL_PRINCIPLES.map((p, i) => {
              const Icon = p.icon;
              return (
                <motion.div
                  key={p.titleKey}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.5, delay: i * 0.06 }}
                >
                  <GlassCard hover className="group h-full p-6">
                    <div
                      className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl"
                      style={{ background: `${p.color}1a`, border: `1px solid ${p.color}33` }}
                    >
                      <Icon className="h-6 w-6" style={{ color: p.color }} />
                    </div>
                    <h3 className="text-base font-semibold">{t("landing", p.titleKey)}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{t("landing", p.descKey)}</p>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section className="relative px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <SectionTitle
            center
            eyebrow={t("landing", "featuresEyebrow")}
            title={<>Everything a <GradientText>Staff Engineer</GradientText> would tell you</>}
            description={t("landing", "featuresDesc")}
          />
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.titleKey}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.5, delay: i * 0.06 }}
                >
                  <GlassCard hover className="group h-full p-6">
                    <div
                      className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl"
                      style={{ background: `${f.color}1a`, border: `1px solid ${f.color}33` }}
                    >
                      <Icon className="h-6 w-6" style={{ color: f.color }} />
                    </div>
                    <h3 className="text-lg font-semibold">{t("landing", f.titleKey)}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{t("landing", f.descKey)}</p>
                    <div
                      className="mt-4 h-px w-full opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ background: `linear-gradient(90deg, ${f.color}, transparent)` }}
                    />
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="relative px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <SectionTitle
            center
            eyebrow={t("landing", "workflowEyebrow")}
            title={<>From keys to <GradientText>AI CTO</GradientText> in 60 seconds</>}
            description={t("landing", "workflowDesc")}
          />
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.n}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="relative"
                >
                  <GlassCard className="h-full p-6">
                    <div className="flex items-center justify-between">
                      <span className="text-5xl font-bold text-white/10">{s.n}</span>
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">{t("landing", s.titleKey)}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{t("landing", s.descKey)}</p>
                  </GlassCard>
                  {i < STEPS.length - 1 && (
                    <ArrowRight className="absolute -right-4 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-cyan-400/40 md:block" />
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* pipeline chips */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-2">
            {[t("landing","pipelineConnect"), t("landing","pipelinePaste"), t("landing","pipelineClone"), t("landing","pipelineScan"), "AST", t("landing","pipelineDeps"), t("landing","pipelineEmbed"), t("landing","pipelineStatic"), t("landing","pipelineAI"), t("landing","pipelineReports"), t("landing","pipelineChat")].map((step, i) => (
              <motion.span
                key={step}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-muted-foreground"
              >
                {step}
              </motion.span>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FEATURE ROUTING ============ */}
      <section className="relative px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <SectionTitle
            center
            eyebrow={t("landing", "routingEyebrow")}
            title={<>Different models for <GradientText>different jobs</GradientText></>}
            description={t("landing", "routingDesc")}
          />
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_ROUTING.map((r, i) => (
              <motion.div
                key={r.feature}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <GlassCard className="flex items-center gap-3 p-4">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold"
                    style={{ background: `${r.color}1a`, color: r.color, border: `1px solid ${r.color}33` }}
                  >
                    {r.feature.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{r.feature}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{r.model}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </GlassCard>
              </motion.div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button onClick={() => setView("providers")} variant="outline">
              <Plug className="mr-1.5 h-4 w-4" /> {t("landing", "routingConfigure")}
            </Button>
          </div>
        </div>
      </section>

      {/* ============ PROVIDERS GRID ============ */}
      <section className="relative px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <SectionTitle
            center
            eyebrow={t("landing", "providersEyebrow")}
            title={<>Connect <GradientText>any AI</GradientText> you already use</>}
            description={t("landing", "providersDesc")}
          />
          <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {PROVIDER_PRESETS.map((p, i) => {
              const Icon = p.local ? HardDrive : p.category === "Aggregator" ? Server : Cloud;
              return (
                <motion.button
                  key={p.providerId}
                  onClick={() => setView("providers")}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.03 }}
                  className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left transition hover:border-cyan-400/40 hover:bg-white/[0.04]"
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: `${p.accent}1a`, color: p.accent, border: `1px solid ${p.accent}33` }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{p.category}</p>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ PRICING ============ */}
      <section className="relative px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <SectionTitle
            center
            eyebrow={t("landing", "pricingEyebrow") || "Pricing"}
            title={<>Free forever. <GradientText>No subscriptions.</GradientText></>}
            description={t("landing", "pricingDesc") || "CodeInsight AI is local-first. Bring your own AI keys. No hidden fees."}
          />
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {[
              {
                name: "Free",
                price: "$0",
                desc: "Everything you need",
                features: ["All 11 AI agents", "Unlimited analyses", "66 analysis rules", "14 AI providers", "Local SQLite DB", "Mission Control"],
                color: "#22d3ee",
                highlight: false,
              },
              {
                name: "Self-Hosted",
                price: "$0",
                desc: "Full control",
                features: ["Everything in Free", "Custom personalities", "Plugin SDK", "Developer Mode", "Git Intelligence", "Terminal sandbox"],
                color: "#a78bfa",
                highlight: true,
              },
              {
                name: "Enterprise",
                price: "Contact",
                desc: "For teams",
                features: ["Everything in Self-Hosted", "Team shared analyses", "SSO + Audit logs", "Priority support", "Custom integrations", "On-premise deploy"],
                color: "#34d399",
                highlight: false,
              },
            ].map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
              >
                <GlassCard
                  className={`relative h-full p-6 ${plan.highlight ? "border-violet-400/40" : ""}`}
                  glow={plan.highlight ? "violet" : "none"}
                >
                  {plan.highlight && (
                    <span
                      className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                      style={{ background: plan.color, color: "#050507" }}
                    >
                      Popular
                    </span>
                  )}
                  <h3 className="text-lg font-bold" style={{ color: plan.color }}>{plan.name}</h3>
                  <p className="mt-1 text-3xl font-bold">{plan.price}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{plan.desc}</p>
                  <div className="mt-4 space-y-2">
                    {plan.features.map((f) => (
                      <div key={f} className="flex items-center gap-2 text-sm">
                        <Check className="h-3.5 w-3.5 shrink-0" style={{ color: plan.color }} />
                        <span className="text-muted-foreground">{f}</span>
                      </div>
                    ))}
                  </div>
                  <Button
                    onClick={() => setView("analyze")}
                    variant="outline"
                    className={`mt-6 w-full ${plan.highlight ? "border-violet-400/40 text-violet-300 hover:bg-violet-400/10" : ""}`}
                  >
                    {plan.price === "Contact" ? "Contact Us" : "Get Started"}
                  </Button>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section className="relative px-4 py-24">
        <div className="mx-auto max-w-3xl">
          <SectionTitle center eyebrow={t("landing", "faqEyebrow")} title={t("landing", "faqTitle")} />
          <div className="mt-10">
            <GlassCard className="p-2">
              <Accordion type="single" collapsible className="w-full">
                {FAQ_KEYS.map((qk, i) => (
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
            </GlassCard>
          </div>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="relative px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <GlassCard strong className="relative overflow-hidden p-10 text-center md:p-16">
            <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-cyan-500/20 blur-3xl" />
            <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-violet-500/20 blur-3xl" />
            <Plug className="relative mx-auto h-10 w-10 text-cyan-300" />
            <h2 className="relative mt-4 text-3xl font-bold md:text-4xl">
              Ready to <GradientText>connect your AI?</GradientText>
            </h2>
            <p className="relative mx-auto mt-3 max-w-xl text-muted-foreground">
              {t("landing", "ctaDesc")}
            </p>
            <div className="relative mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
              <Button
                onClick={() => setView("providers")}
                size="lg"
                className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
              >
                <Plug className="mr-1.5 h-4 w-4" /> {t("landing", "ctaConnect")}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
              <Button onClick={() => setView("analyze")} size="lg" variant="outline">
                <Github className="mr-1.5 h-4 w-4" /> {t("landing", "ctaAnalyze")}
              </Button>
            </div>
          </GlassCard>
        </div>
      </section>

      {/* ============ TESTIMONIALS ============ */}
      <section className="relative px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <SectionTitle
            center
            eyebrow="TESTIMONIALS"
            title={<>Loved by <GradientText>developers</GradientText></>}
            description="What developers say about CodeInsight AI"
          />
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {[
              { name: "Alex Chen", role: "Staff Engineer @ Vercel", text: "The multi-agent system is incredible. It caught 3 security issues our team missed for months.", color: "#22d3ee" },
              { name: "Sarah Kim", role: "CTO @ StartupOS", text: "Mission Control feels like having a Senior Engineer on call 24/7. Game changer for code reviews.", color: "#a78bfa" },
              { name: "Marcus Lee", role: "Open Source Maintainer", text: "Local-first with BYO keys — exactly what I wanted. No subscriptions, no data leaving my machine.", color: "#34d399" },
            ].map((tst, i) => (
              <motion.div
                key={tst.name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
              >
                <GlassCard hover className="h-full p-6">
                  <div className="mb-4 flex gap-1">
                    {[0,1,2,3,4].map(s => (
                      <span key={s} className="text-amber-400 text-sm">★</span>
                    ))}
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90">"{tst.text}"</p>
                  <div className="mt-4 flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
                      style={{ background: `${tst.color}1a`, color: tst.color }}
                    >
                      {tst.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{tst.name}</p>
                      <p className="text-[11px] text-muted-foreground">{tst.role}</p>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PIPELINE VISUAL ============ */}
      <section className="relative px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <SectionTitle
            center
            eyebrow="HOW IT WORKS"
            title={<>From URL to <GradientText>full report</GradientText> in 60 seconds</>}
            description="Watch the 8-stage pipeline analyze any repository"
          />
          <div className="mt-14">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              {[
                { n: "01", label: "Clone", icon: Github, color: "#22d3ee" },
                { n: "02", label: "Scan", icon: ScanSearch, color: "#a78bfa" },
                { n: "03", label: "AST", icon: Code2, color: "#f472b6" },
                { n: "04", label: "Deps", icon: Network, color: "#34d399" },
                { n: "05", label: "Embed", icon: Brain, color: "#fbbf24" },
                { n: "06", label: "Static", icon: ShieldCheck, color: "#22d3ee" },
                { n: "07", label: "AI", icon: Sparkles, color: "#a78bfa" },
                { n: "08", label: "Report", icon: FileText, color: "#34d399" },
              ].map((s, i) => {
                const Icon = s.icon;
                return (
                  <motion.div
                    key={s.n}
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className="group flex flex-1 flex-col items-center gap-2"
                  >
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-xl border transition-all group-hover:scale-110"
                      style={{ borderColor: `${s.color}33`, background: `${s.color}0a` }}
                    >
                      <Icon className="h-5 w-5" style={{ color: s.color }} />
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">{s.n}</span>
                    <span className="text-xs font-medium">{s.label}</span>
                    {i < 7 && (
                      <div className="hidden h-px w-full bg-gradient-to-r from-white/10 to-transparent md:block" />
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ============ STATS GRID ============ */}
      <section className="relative px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { icon: ShieldCheck, label: "Security Rules", value: "13", color: "#f472b6" },
              { icon: Bug, label: "Bug Patterns", value: "11", color: "#fbbf24" },
              { icon: Gauge, label: "Perf Rules", value: "42", color: "#34d399" },
              { icon: Bot, label: "AI Agents", value: "12", color: "#22d3ee" },
            ].map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                >
                  <GlassCard className="p-5 text-center">
                    <Icon className="mx-auto h-6 w-6" style={{ color: stat.color }} />
                    <p className="mt-2 text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="relative overflow-hidden px-4 py-24">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent" />
        <div className="relative mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl font-bold md:text-5xl">
              Start <GradientText>analyzing</GradientText> now
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
              Paste a GitHub URL. Get a full senior-engineer-level report in 60 seconds. Free, local, private.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-2 sm:flex-row">
              <Button
                onClick={() => setView("analyze")}
                size="lg"
                className="glow-pulse bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
              >
                <Sparkles className="mr-1.5 h-4 w-4" /> Analyze a Repository
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
              <Button onClick={() => setView("providers")} size="lg" variant="outline">
                <Plug className="mr-1.5 h-4 w-4" /> Connect AI Provider
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
