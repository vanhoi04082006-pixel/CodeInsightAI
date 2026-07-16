"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
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
import { AICore } from "@/components/3d/ai-core";
import { GlassCard, SectionTitle, GradientText, NeonDivider, AnimatedCounter } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { parseRepoUrl } from "@/lib/analysis-engine";
import { PROVIDER_PRESETS } from "@/lib/providers";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FEATURES = [
  { icon: Brain, title: "Deep Code Understanding", desc: "AI parses every file, builds embeddings, and understands your architecture like a senior engineer reading it for the first time.", color: "#22d3ee" },
  { icon: Network, title: "Dependency Graph", desc: "Interactive visualisation of module relationships with circular-dependency and dead-code detection baked in.", color: "#a78bfa" },
  { icon: ShieldCheck, title: "Security Audit", desc: "Catches vulnerabilities from hardcoded secrets to weak hashing and XSS — with concrete remediation steps.", color: "#f472b6" },
  { icon: Gauge, title: "Performance Analysis", desc: "Identifies bundle bloat, N+1 queries, memory leaks, and render bottlenecks ranked by impact.", color: "#34d399" },
  { icon: Bug, title: "Bug Detection", desc: "Race conditions, null derefs, off-by-one errors and logic flaws — found automatically with severity scoring.", color: "#fbbf24" },
  { icon: FileText, title: "Auto Documentation", desc: "Generates READMEs, API docs, architecture diagrams, UML and sequence diagrams on demand.", color: "#60a5fa" },
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
  { n: "01", title: "Connect your AI", desc: "Add OpenRouter, OpenAI, Anthropic, or a local Ollama instance. Your keys stay in your browser.", icon: Plug },
  { n: "02", title: "Paste a Repo URL", desc: "Drop any public GitHub repository link. We clone, parse ASTs, and build the dependency graph.", icon: Github },
  { n: "03", title: "Get a Full Report", desc: "Scores, bugs, security, architecture, performance — and an AI ready to chat about your code.", icon: ScanSearch },
];

const LOCAL_PRINCIPLES = [
  { icon: KeyRound, title: "Bring your own keys", desc: "Connect OpenRouter, OpenAI, Anthropic, Gemini, DeepSeek, Groq, Ollama, LM Studio, Azure, Together, Fireworks, Mistral, xAI, or any OpenAI-compatible API.", color: "#22d3ee" },
  { icon: HardDrive, title: "You own your data", desc: "Analyses are stored locally in your browser. Nothing is sent to us — no telemetry, no servers in the middle.", color: "#34d399" },
  { icon: Plug, title: "No subscriptions", desc: "No billing, no plans, no trials, no feature locks. Use whatever models and providers you already pay for.", color: "#a78bfa" },
  { icon: Server, title: "Local models supported", desc: "Run entirely offline with Ollama or LM Studio. Your code never leaves your machine.", color: "#fbbf24" },
];

const FEATURE_ROUTING = [
  { feature: "Bug Detection", model: "Claude 3.5 Sonnet", color: "#d97706" },
  { feature: "Repository Chat", model: "GPT-4o", color: "#10a37f" },
  { feature: "Documentation", model: "DeepSeek Coder", color: "#4d6bfe" },
  { feature: "Vision / Images", model: "Gemini 1.5 Pro", color: "#4285f4" },
  { feature: "Refactoring", model: "Qwen 2.5 72B", color: "#8b5cf6" },
  { feature: "Security Audit", model: "Claude 3.5 Sonnet", color: "#d97706" },
];

const FAQ = [
  { q: "Do I need to pay for CodeInsight AI?", a: "No. CodeInsight AI is a local-first platform — there are no subscriptions, plans, or billing. You bring your own AI API keys (OpenAI, Anthropic, OpenRouter, etc.) or run a local model with Ollama. You only pay your AI provider directly for what you use." },
  { q: "Where are my API keys stored?", a: "Keys are stored only in your browser's local storage. They are never sent to CodeInsight servers, never logged, and never shared. You can clear them at any time from Settings." },
  { q: "Can I use a local model like Ollama or LM Studio?", a: "Yes. Add an Ollama or LM Studio provider with the local base URL (e.g. http://localhost:11434/v1). Your code is analysed entirely on your machine — nothing leaves your network." },
  { q: "Can I use different models for different tasks?", a: "Absolutely. The Feature → Model routing panel lets you assign each feature (chat, bug detection, docs, vision, refactoring) to a different provider and model. For example: Claude for bugs, GPT-4o for chat, DeepSeek for docs." },
  { q: "Which providers are supported?", a: "OpenRouter, OpenAI, Anthropic (Claude), Google Gemini, DeepSeek, Groq, Ollama, LM Studio, Azure OpenAI, Together AI, Fireworks AI, Mistral, xAI (Grok), and any OpenAI-compatible custom endpoint. You can connect unlimited providers." },
  { q: "Can I analyze private repositories?", a: "Yes. Because the analysis runs through your own AI keys and runs locally, private repos never pass through a third-party SaaS. Clone the repo locally and point CodeInsight at it, or paste a URL your provider can reach." },
];

export function LandingView() {
  const setView = useAppStore((s) => s.setView);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, -80]);

  const startAnalysis = () => {
    const parsed = parseRepoUrl(url);
    if (!parsed.valid) {
      setError("Enter a valid GitHub URL like https://github.com/vercel/next.js");
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
          <AICore className="h-[60vh] w-[60vh] max-h-[640px] max-w-[640px] opacity-90" />
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
            <span className="text-muted-foreground">Local-first · Bring your own AI · No subscriptions</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05 }}
            className="max-w-4xl text-balance text-5xl font-bold tracking-tight md:text-7xl"
          >
            Paste a GitHub Repo.
            <br />
            <GradientText>AI Understands Everything.</GradientText>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="mt-6 max-w-2xl text-balance text-base text-muted-foreground md:text-xl"
          >
            A local-first AI development platform. Connect your own AI APIs, analyze any repository,
            and chat with your code like a Senior Staff Engineer. Your keys, your data, your models.
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
              <span>Try:</span>
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
            <span className="flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> Use your own AI APIs</span>
            <span className="flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5" /> Data stays with you</span>
            <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> 60-second analysis</span>
            <span className="flex items-center gap-1.5"><Plug className="h-3.5 w-3.5" /> 14 providers supported</span>
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
              { value: 14, suffix: "", label: "AI providers", color: "#22d3ee" },
              { value: 40, suffix: "+", label: "Languages", color: "#a78bfa" },
              { value: 0, suffix: "", label: "Subscriptions", color: "#34d399" },
              { value: 60, suffix: "s", label: "Avg. analysis", color: "#fbbf24" },
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
          Understands every major stack
        </p>
        <div className="relative mask-fade-x">
          <div className="flex w-max gap-4 animate-[marquee_30s_linear_infinite]">
            {[...TECH_LOGOS, ...TECH_LOGOS].map((t, i) => {
              const Icon = t.icon;
              return (
                <div
                  key={i}
                  className="flex shrink-0 items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2.5"
                  style={{ color: t.color }}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-sm font-medium text-foreground/80">{t.name}</span>
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
            eyebrow="Local-first"
            title={<>Your keys. Your data. <GradientText>Your AI.</GradientText></>}
            description="CodeInsight AI is not a SaaS. It's a self-hosted AI workspace — like Open WebUI or Continue.dev, built for repository analysis."
          />
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {LOCAL_PRINCIPLES.map((p, i) => {
              const Icon = p.icon;
              return (
                <motion.div
                  key={p.title}
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
                    <h3 className="text-base font-semibold">{p.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
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
            eyebrow="Capabilities"
            title={<>Everything a <GradientText>Staff Engineer</GradientText> would tell you</>}
            description="CodeInsight doesn't summarise your README. It reads your code, understands your architecture, and reports like a senior engineer doing a deep-dive review."
          />
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.title}
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
                    <h3 className="text-lg font-semibold">{f.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
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
            eyebrow="Workflow"
            title={<>From keys to <GradientText>AI CTO</GradientText> in 60 seconds</>}
            description="A simple workflow: connect your AI, paste a repo, get a full report."
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
                    <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
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
            {["Connect AI", "Paste URL", "Clone", "Scan", "AST", "Dependency Graph", "Embeddings", "Static Analysis", "AI Analysis", "Reports", "Chat Ready"].map((step, i) => (
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
            eyebrow="Multi-model routing"
            title={<>Different models for <GradientText>different jobs</GradientText></>}
            description="Route each feature to the model that does it best. Switch providers freely — no lock-in."
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
              <Plug className="mr-1.5 h-4 w-4" /> Configure routing
            </Button>
          </div>
        </div>
      </section>

      {/* ============ PROVIDERS GRID ============ */}
      <section className="relative px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <SectionTitle
            center
            eyebrow="Supported providers"
            title={<>Connect <GradientText>any AI</GradientText> you already use</>}
            description="14 providers supported out of the box, plus any OpenAI-compatible endpoint."
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

      {/* ============ FAQ ============ */}
      <section className="relative px-4 py-24">
        <div className="mx-auto max-w-3xl">
          <SectionTitle center eyebrow="FAQ" title="Questions, answered" />
          <div className="mt-10">
            <GlassCard className="p-2">
              <Accordion type="single" collapsible className="w-full">
                {FAQ.map((item, i) => (
                  <AccordionItem key={i} value={`item-${i}`} className="border-white/5">
                    <AccordionTrigger className="px-4 text-left hover:no-underline">
                      <span className="text-sm font-medium">{item.q}</span>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 text-sm text-muted-foreground">
                      {item.a}
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
              Add your first provider and start analyzing repositories. No sign-up, no billing — just your keys.
            </p>
            <div className="relative mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
              <Button
                onClick={() => setView("providers")}
                size="lg"
                className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
              >
                <Plug className="mr-1.5 h-4 w-4" /> Connect Your AI
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
              <Button onClick={() => setView("analyze")} size="lg" variant="outline">
                <Github className="mr-1.5 h-4 w-4" /> Analyze a repo
              </Button>
            </div>
          </GlassCard>
        </div>
      </section>
    </div>
  );
}
