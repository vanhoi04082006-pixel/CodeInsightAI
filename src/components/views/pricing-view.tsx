"use client";

import { motion } from "framer-motion";
import { Check, Crown, Sparkles, Zap, Building2, ArrowRight, Star } from "lucide-react";
import { GlassCard, GradientText, NeonDivider, SectionTitle } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    name: "Hacker",
    icon: Sparkles,
    price: 0,
    period: "/mo",
    desc: "For weekend projects and exploration.",
    features: ["5 analyses / month", "Public repos only", "AI chat (standard model)", "Basic reports", "Community support"],
    cta: "Start free",
    highlight: false,
    color: "#22d3ee",
  },
  {
    name: "Pro",
    icon: Zap,
    price: 24,
    period: "/mo",
    desc: "For serious developers and small teams.",
    features: ["Unlimited analyses", "Private repositories", "AI chat (GPT-4o + Claude)", "Full reports + PDF export", "Dependency graph export", "Priority support", "API access (1k req/mo)"],
    cta: "Upgrade to Pro",
    highlight: true,
    color: "#a78bfa",
  },
  {
    name: "Team",
    icon: Building2,
    price: 79,
    period: "/mo",
    desc: "For scaling engineering orgs.",
    features: ["Everything in Pro", "Shared workspaces", "Up to 20 seats", "SSO & SAML", "Audit logs", "API access (50k req/mo)", "Dedicated support", "Custom integrations"],
    cta: "Contact sales",
    highlight: false,
    color: "#f472b6",
  },
];

const COMPARISON = [
  { feature: "Analyses / month", hacker: "5", pro: "Unlimited", team: "Unlimited" },
  { feature: "Private repositories", hacker: false, pro: true, team: true },
  { feature: "GPT-4o + Claude", hacker: false, pro: true, team: true },
  { feature: "PDF / Markdown export", hacker: false, pro: true, team: true },
  { feature: "Dependency graph export", hacker: false, pro: true, team: true },
  { feature: "Shared workspaces", hacker: false, pro: false, team: true },
  { feature: "SSO / SAML", hacker: false, pro: false, team: true },
  { feature: "Audit logs", hacker: false, pro: false, team: true },
  { feature: "API access", hacker: false, pro: "1k/mo", team: "50k/mo" },
  { feature: "Support", hacker: "Community", pro: "Priority", team: "Dedicated" },
];

export function PricingView() {
  const setView = useAppStore((s) => s.setView);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
      <SectionTitle
        center
        eyebrow="Pricing"
        title={<>Start free. <GradientText>Scale when ready.</GradientText></>}
        description="No credit card required to start. Cancel anytime."
      />

      {/* toggle (decorative) */}
      <div className="mt-8 flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
          <button className="rounded-full bg-gradient-to-r from-cyan-500/30 to-violet-500/30 px-4 py-1.5 text-xs font-medium">Monthly</button>
          <button className="rounded-full px-4 py-1.5 text-xs text-muted-foreground">Yearly <span className="text-emerald-400">−20%</span></button>
        </div>
      </div>

      {/* plans */}
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {PLANS.map((p, i) => {
          const Icon = p.icon;
          return (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <GlassCard
                strong={p.highlight}
                className={cn("relative h-full overflow-hidden p-6", p.highlight && "neon-border-cyan")}
              >
                {p.highlight && (
                  <>
                    <div className="absolute -right-10 top-6 rotate-45 bg-gradient-to-r from-cyan-500 to-violet-500 px-10 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Popular
                    </div>
                    <div className="absolute -left-8 -top-8 h-32 w-32 rounded-full bg-cyan-500/10 blur-3xl" />
                  </>
                )}
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${p.color}1a`, color: p.color, border: `1px solid ${p.color}33` }}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">${p.price}</span>
                  <span className="text-sm text-muted-foreground">{p.period}</span>
                </div>
                <Button
                  onClick={() => {
                    if (p.name === "Hacker") setView("analyze");
                    else toast.success(`${p.name} plan — demo only`);
                  }}
                  className={cn("mt-5 w-full", p.highlight && "bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90")}
                  variant={p.highlight ? "default" : "outline"}
                >
                  {p.cta}
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
                <NeonDivider className="my-5" />
                <ul className="space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: p.color }} />
                      <span className="text-foreground/85">{f}</span>
                    </li>
                  ))}
                </ul>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      {/* comparison table */}
      <div className="mt-14">
        <h3 className="text-center text-xl font-bold">Compare plans</h3>
        <GlassCard className="mt-6 overflow-hidden p-0">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-4 text-left font-medium text-muted-foreground">Feature</th>
                  <th className="p-4 text-center font-semibold text-cyan-300">Hacker</th>
                  <th className="p-4 text-center font-semibold text-violet-300">Pro</th>
                  <th className="p-4 text-center font-semibold text-pink-300">Team</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row, i) => (
                  <tr key={row.feature} className={cn("border-b border-white/5", i % 2 === 1 && "bg-white/[0.015]")}>
                    <td className="p-4 font-medium">{row.feature}</td>
                    <Cell value={row.hacker} />
                    <Cell value={row.pro} highlight />
                    <Cell value={row.team} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>

      {/* enterprise CTA */}
      <div className="mt-14">
        <GlassCard strong className="relative overflow-hidden p-8 text-center md:p-12">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet-500/15 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-cyan-500/15 blur-3xl" />
          <Crown className="relative mx-auto h-10 w-10 text-amber-300" />
          <h2 className="relative mt-3 text-2xl font-bold md:text-3xl">Need something custom?</h2>
          <p className="relative mx-auto mt-2 max-w-xl text-muted-foreground">
            Enterprise plans with on-prem deployment, custom models, and dedicated infrastructure.
          </p>
          <Button onClick={() => toast.success("We'll be in touch — demo only")} className="relative mt-5 bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
            <Star className="mr-1.5 h-4 w-4" /> Talk to sales
          </Button>
        </GlassCard>
      </div>
    </div>
  );
}

function Cell({ value, highlight }: { value: string | boolean; highlight?: boolean }) {
  return (
    <td className={cn("p-4 text-center", highlight && "bg-violet-500/[0.04]")}>
      {typeof value === "boolean" ? (
        value ? (
          <Check className="mx-auto h-4 w-4 text-emerald-400" />
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )
      ) : (
        <span className="text-foreground/85">{value}</span>
      )}
    </td>
  );
}
