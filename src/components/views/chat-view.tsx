"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  Send,
  Sparkles,
  User,
  Bot,
  Loader2,
  Cpu,
  FolderGit2,
  Trash2,
  Lightbulb,
  Shield,
  Gauge,
  Network,
  Code2,
} from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { DeveloperPanel, LogViewer } from "@/components/shared/debug-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/lib/store";
import { usePersonalityStore } from "@/lib/personality-store";
import { useProvidersStore } from "@/lib/providers-store";
import { useDeveloperModeStore } from "@/lib/developer-mode-store";
import type { ChatMessage } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  { icon: Shield, text: "What are the biggest security risks?", color: "#f472b6" },
  { icon: Gauge, text: "How can I improve performance?", color: "#34d399" },
  { icon: Network, text: "How does the architecture work?", color: "#a78bfa" },
  { icon: Code2, text: "Which files should I refactor first?", color: "#22d3ee" },
  { icon: Lightbulb, text: "What feature should I build next?", color: "#fbbf24" },
];

export function ChatView() {
  const report = useAppStore((s) => s.activeReport);
  const setView = useAppStore((s) => s.setView);
  const chat = useAppStore((s) => s.chat);
  const pushChat = useAppStore((s) => s.pushChat);
  const setChat = useAppStore((s) => s.setChat);
  const clearChat = useAppStore((s) => s.clearChat);
  const analysisId = useAppStore((s) => s.activeAnalysisId);
  const setAnalysisId = useAppStore((s) => s.setActiveAnalysisId);
  const activePersonality = usePersonalityStore((s) => s.getActive());
  const latestSnapshot = useDeveloperModeStore((s) => s.snapshots[0] ?? null);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // When a report is loaded with an existing analysisId, restore persisted chat.
  // Otherwise seed an intro message if chat is empty.
  useEffect(() => {
    if (!report) return;
    if (analysisId) {
      setRestoring(true);
      fetch(`/api/history?id=${analysisId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: analysisId }) })
        .then((r) => r.json())
        .then((data) => {
          if (data?.messages?.length) {
            setChat(data.messages);
          } else {
            seedIntro();
          }
        })
        .catch(() => seedIntro())
        .finally(() => setRestoring(false));
    } else if (chat.length === 0) {
      seedIntro();
    }
  }, [report?.repoUrl, analysisId]);

  function seedIntro() {
    if (!report || chat.length > 0) return;
    pushChat({
      id: crypto.randomUUID(),
      role: "assistant",
      content: `I've finished analysing **${report.repoOwner}/${report.repoName}**.\n\nHere's the quick read:\n- Overall health: **${report.scores.overall}/100**\n- Top risk: ${report.issues.security[0]?.title ?? "none critical"}\n- Architecture: ${report.architecture.pattern}\n\nAsk me anything — security, performance, what to refactor, or what to build next.`,
      createdAt: Date.now(),
    });
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat, loading]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    if (!report) {
      toast.error("Analyze a repository first");
      return;
    }
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content, createdAt: Date.now() };
    pushChat(userMsg);
    setInput("");
    setLoading(true);

    // pull personality + provider + developer mode from their stores
    const personality = usePersonalityStore.getState().getActive();
    const providersState = useProvidersStore.getState();
    const providerInstance = providersState.getProviderForFeature("chat");
    const devMode = useDeveloperModeStore.getState();

    try {
      // Ensure we have an analysisId persisted (create the analysis row if needed)
      let aid = analysisId;
      if (!aid) {
        const createRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl: report.repoUrl }),
        });
        const createData = await createRes.json();
        aid = createData.id ?? null;
        if (aid) setAnalysisId(aid);
      }

      const history = chat.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: aid,
          message: content,
          history,
          // AI request pipeline: personality + provider
          personality: {
            id: personality.id,
            name: personality.name,
            systemPrompt: personality.systemPrompt,
            temperature: personality.temperature,
            maxTokens: personality.maxTokens,
            preferredModel: personality.preferredModel,
          },
          provider: providerInstance
            ? {
                providerId: providerInstance.providerId,
                label: providerInstance.label,
                model: providerInstance.model,
                baseUrl: providerInstance.baseUrl,
                temperature: providerInstance.temperature,
                maxTokens: providerInstance.maxTokens,
                streaming: providerInstance.streaming,
                timeout: providerInstance.timeout,
                apiKey: providerInstance.apiKey, // used by a real provider impl; masked in debug
              }
            : undefined,
          debug: devMode.enabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Chat failed");
      pushChat(data.message ?? { id: crypto.randomUUID(), role: "assistant", content: data.reply, createdAt: Date.now() });

      // record debug snapshot + log if developer mode is on
      if (devMode.enabled && data.debug) {
        devMode.addSnapshot(data.debug);
        if (data.debug.log) devMode.addLog(data.debug.log);
      }
    } catch (e) {
      console.error(e);
      toast.error("The AI couldn't respond. Please try again.");
      pushChat({
        id: crypto.randomUUID(),
        role: "assistant",
        content: "I ran into an issue processing that. Could you rephrase or try again?",
        createdAt: Date.now(),
      });
    } finally {
      setLoading(false);
    }
  };

  if (!report) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <GlassCard className="p-10">
          <Cpu className="mx-auto h-10 w-10 text-cyan-300" />
          <h2 className="mt-4 text-xl font-bold">No repository loaded</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Analyze a repository first, then chat with your AI CTO about it.
          </p>
          <Button onClick={() => setView("analyze")} className="mt-4 bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
            <Sparkles className="mr-1.5 h-4 w-4" /> Analyze a repo
          </Button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-4xl flex-col px-4 py-4 md:px-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/30 to-violet-500/30">
            <Bot className="h-5 w-5 text-cyan-300" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">AI CTO</h1>
            <p className="text-[11px] text-muted-foreground">
              <FolderGit2 className="mr-1 inline h-3 w-3" />
              {report.repoOwner}/{report.repoName}
            </p>
          </div>
          {/* active personality badge */}
          <button
            onClick={() => useAppStore.getState().setView("personalities")}
            className="ml-2 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] transition hover:border-cyan-400/40"
            title="Change personality"
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: activePersonality.accent }} />
            <span className="font-medium">{activePersonality.name}</span>
          </button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { clearChat(); toast.success("Chat cleared"); }}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear
        </Button>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="mt-4 flex-1 space-y-4 overflow-y-auto scrollbar-thin pr-1">
        <AnimatePresence initial={false}>
          {chat.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
            <Avatar role="assistant" />
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.04] px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
              <span className="text-sm text-muted-foreground">Thinking like a Staff Engineer…</span>
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-cyan-400"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
                  />
                ))}
              </span>
            </div>
          </motion.div>
        )}

        {/* suggestions when chat is short */}
        {chat.length <= 1 && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 pt-2">
            <p className="px-1 text-xs uppercase tracking-wider text-muted-foreground">Try asking</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.text}
                    onClick={() => send(s.text)}
                    className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left transition hover:border-cyan-400/30 hover:bg-white/[0.04]"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${s.color}1a`, color: s.color }}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm">{s.text}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>

      {/* Developer panel (only renders when Developer Mode is enabled) */}
      <div className="mt-3 space-y-2">
        <DeveloperPanel snapshot={latestSnapshot} />
        <LogViewer />
      </div>

      {/* composer */}
      <div className="mt-3">
        <GlassCard strong className="p-2">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask your AI CTO anything about this codebase…"
              rows={1}
              className="max-h-32 min-h-[44px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm shadow-none focus-visible:ring-0"
            />
            <Button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </GlassCard>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          CodeInsight AI · GPT-4o + Claude · Answers are AI-generated and should be reviewed.
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}
    >
      <Avatar role={message.role} />
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "rounded-tr-sm bg-gradient-to-br from-cyan-500/20 to-violet-500/15 text-foreground"
            : "rounded-tl-sm border border-white/10 bg-white/[0.04]"
        )}
      >
        <MarkdownLite content={message.content} />
      </div>
    </motion.div>
  );
}

function Avatar({ role }: { role: "user" | "assistant" }) {
  if (role === "user") {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
        <User className="h-4 w-4 text-foreground/70" />
      </div>
    );
  }
  return (
    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/30 to-violet-500/30">
      <Bot className="h-5 w-5 text-cyan-300" />
    </div>
  );
}

/* Lightweight markdown renderer (headings, bold, code, lists) */
function MarkdownLite({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) return <h4 key={i} className="mt-2 text-sm font-bold">{line.slice(4)}</h4>;
        if (line.startsWith("## ")) return <h3 key={i} className="mt-2 text-base font-bold">{line.slice(3)}</h3>;
        if (line.startsWith("# ")) return <h2 key={i} className="mt-2 text-lg font-bold">{line.slice(2)}</h2>;
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <div key={i} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan-400" />
              <span>{renderInline(line.slice(2))}</span>
            </div>
          );
        }
        if (line.startsWith("```")) return null;
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i} className="leading-relaxed">{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  // bold **x** and inline code `x`
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      parts.push(<strong key={key++} className="font-semibold text-foreground">{tok.slice(2, -2)}</strong>);
    } else {
      parts.push(<code key={key++} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[12px] text-cyan-300">{tok.slice(1, -1)}</code>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
