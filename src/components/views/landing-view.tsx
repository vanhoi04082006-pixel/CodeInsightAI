"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  GitBranch,
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
  Star,
  Github,
  ScanSearch,
  Boxes,
  Lock,
  Rocket,
  Code2,
  Database,
  Cloud,
  Cpu,
  Terminal,
  Layers,
  GitMerge,
} from "lucide-react";
import { AICore } from "@/components/3d/ai-core";
import { GlassCard, SectionTitle, GradientText, NeonDivider, AnimatedCounter } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { parseRepoUrl } from "@/lib/analysis-engine";
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
  { name: "Rust", icon: Boxes, color: "#fb923c" },
  { name: "Vue", icon: Layers, color: "#34d399" },
  { name: "PostgreSQL", icon: Database, color: "#60a5fa" },
  { name: "Docker", icon: Boxes, color: "#22d3ee" },
  { name: "AWS", icon: Cloud, color: "#fbbf24" },
  { name: "GraphQL", icon: GitMerge, color: "#f472b6" },
];

const STEPS = [
  { n: "01", title: "Paste a Repo URL", desc: "Drop any public GitHub repository link. We handle the rest.", icon: Github },
  { n: "02", title: "AI Clones & Scans", desc: "We clone, parse ASTs, build the dependency graph, and create embeddings.", icon: ScanSearch },
  { n: "03", title: "Get a Full Report", desc: "Scores, bugs, security, architecture, performance — and an AI CTO ready to chat.", icon: Sparkles },
];

const PRICING = [
  {
    name: "Hacker",
    price: "$0",
    period: "/mo",
    desc: "For weekend projects and exploration.",
    features: ["5 analyses / month", "Public repos only", "AI chat (standard model)", "Basic reports", "Community support"],
    cta: "Start free",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$24",
    period: "/mo",
    desc: "For serious developers and small teams.",
    features: ["Unlimited analyses", "Private repositories", "AI chat (GPT-4o + Claude)", "Full reports + PDF export", "Dependency graph export", "Priority support"],
    cta: "Upgrade to Pro",
    highlight: true,
  },
  {
    name: "Team",
    price: "$79",
    period: "/mo",
    desc: "For scaling engineering orgs.",
    features: ["Everything in Pro", "Shared workspaces", "SSO & SAML", "Audit logs", "API access", "Dedicated support"],
    cta: "Contact sales",
    highlight: false,
  },
];

const FAQ = [
  { q: "How does CodeInsight AI actually understand my code?", a: "We clone the repository, parse every file into an abstract syntax tree, build a dependency graph, and generate vector embeddings. The AI then reasons over this structured representation combined with static analysis output — the same way a senior engineer would, just faster and across the whole codebase at once." },
  { q: "Can it analyze private repositories?", a: "Yes. On the Pro and Team plans you connect GitHub with scoped read access. We only read the repositories you authorize, never persist source code beyond the analysis, and you can revoke access at any time." },
  { q: "Which AI models power the analysis?", a: "We route through OpenRouter so you get the best model for each task — GPT-4o and Claude for reasoning, DeepSeek for fast triage, and Gemini for long-context files. You can pick a default model in Settings." },
  { q: "Is my source code used to train models?", a: "Never. We do not use your code for training, and our providers' enterprise agreements explicitly opt out of training on API traffic. Your code is analysed ephemerally and only the structured report is stored." },
  { q: "What languages and frameworks are supported?", a: "All major languages including TypeScript, JavaScript, Python, Go, Rust, Java, C#, Ruby, PHP, and Swift. We auto-detect frameworks like React, Next.js, Vue, Django, Rails, Spring, and more." },
  { q: "Can I export and share reports?", a: "Yes — reports export to PDF, Markdown, and HTML. You can also generate a shareable read-only link, perfect for code reviews and onboarding new engineers." },
];

const TESTIMONIALS = [
  { name: "Sarah Chen", role: "Staff Engineer, Stripe", text: "It's like having a principal engineer on call. The architecture review caught coupling issues we'd been ignoring for years.", avatar: "SC", color: "#22d3ee" },
  { name: "Marcus Rivera", role: "CTO, Linear", text: "We use CodeInsight on every acquisition diligence. 10 minutes instead of a week of code review.", avatar: "MR", color: "#a78bfa" },
  { name: "Priya Nair", role: "Eng Lead, Vercel", text: "The AI chat is uncanny. It told me exactly which file to refactor and why. Saved my team a sprint.", avatar: "PN", color: "#f472b6" },
];

export function LandingView() {
  const setView = useAppStore((s) => s.setView);
  const setActiveReport = useAppStore((s) => s.setActiveReport);
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
        {/* 3D AI Core */}
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
            <span className="text-muted-foreground">Powered by GPT-4o · Claude · Gemini · DeepSeek</span>
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
            CodeInsight AI acts like your Senior Staff Engineer, Security Expert, and CTO combined.
            Clone, scan, analyse, and chat with any codebase in seconds.
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
                Start Analysis
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
            <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Private repos</span>
            <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> 60-second analysis</span>
            <span className="flex items-center gap-1.5"><Boxes className="h-3.5 w-3.5" /> 40+ languages</span>
            <span className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5" /> 4.9/5 from 2,400+ devs</span>
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
              { value: 2400, suffix: "+", label: "Developers", color: "#22d3ee" },
              { value: 185000, suffix: "+", label: "Lines analysed", color: "#a78bfa" },
              { value: 99.9, suffix: "%", label: "Uptime", color: "#34d399", decimals: 1 },
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
                  <AnimatedCounter value={s.value} suffix={s.suffix} decimals={s.decimals ?? 0} />
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
            title={<>From URL to <GradientText>AI CTO</GradientText> in 60 seconds</>}
            description="A multi-stage pipeline that mirrors how a senior engineer actually onboards to a codebase."
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
            {["Clone", "Scan", "Detect Languages", "Detect Frameworks", "AST", "Dependency Graph", "Embeddings", "Static Analysis", "AI Analysis", "Reports", "Chat Ready"].map((step, i) => (
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

      {/* ============ TESTIMONIALS ============ */}
      <section className="relative px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <SectionTitle
            center
            eyebrow="Loved by engineers"
            title={<>Trusted by teams that <GradientText>ship fast</GradientText></>}
          />
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
              >
                <GlassCard className="h-full p-6">
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-foreground/90">"{t.text}"</p>
                  <div className="mt-5 flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold"
                      style={{ background: `${t.color}22`, color: t.color, border: `1px solid ${t.color}44` }}
                    >
                      {t.avatar}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PRICING ============ */}
      <section className="relative px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <SectionTitle
            center
            eyebrow="Pricing"
            title={<>Start free. <GradientText>Scale when ready.</GradientText></>}
            description="No credit card required to start. Cancel anytime."
          />
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {PRICING.map((p, i) => (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
              >
                <GlassCard
                  strong={p.highlight}
                  className={p.highlight ? "relative h-full overflow-hidden p-6 neon-border-cyan" : "h-full p-6"}
                >
                  {p.highlight && (
                    <div className="absolute -right-10 top-6 rotate-45 bg-gradient-to-r from-cyan-500 to-violet-500 px-10 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Popular
                    </div>
                  )}
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-bold">{p.price}</span>
                    <span className="text-sm text-muted-foreground">{p.period}</span>
                  </div>
                  <Button
                    onClick={() => setView("pricing")}
                    className={`mt-5 w-full ${
                      p.highlight
                        ? "bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
                        : ""
                    }`}
                    variant={p.highlight ? "default" : "outline"}
                  >
                    {p.cta}
                  </Button>
                  <NeonDivider className="my-5" />
                  <ul className="space-y-2.5">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                        <span className="text-foreground/85">{f}</span>
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              </motion.div>
            ))}
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
            <Rocket className="relative mx-auto h-10 w-10 text-cyan-300" />
            <h2 className="relative mt-4 text-3xl font-bold md:text-4xl">
              Ready to <GradientText>understand any codebase?</GradientText>
            </h2>
            <p className="relative mx-auto mt-3 max-w-xl text-muted-foreground">
              Join thousands of developers using CodeInsight AI to ship better code, faster.
            </p>
            <Button
              onClick={() => setView("analyze")}
              size="lg"
              className="relative mt-6 bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
            >
              <Sparkles className="mr-1.5 h-4 w-4" />
              Analyze your first repo — free
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </GlassCard>
        </div>
      </section>
    </div>
  );
}
