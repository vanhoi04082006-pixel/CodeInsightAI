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
  Check,
  Copy,
  ScrollText,
} from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { DeveloperConsole } from "@/components/dev-console/developer-console";
import { RequestLogSidebar } from "@/components/shared/request-log-sidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/lib/store";
import { usePersonalityStore } from "@/lib/personality-store";
import { useProvidersStore } from "@/lib/providers-store";
import { useDeveloperModeStore } from "@/lib/developer-mode-store";
import { useI18nStore, useT } from "@/lib/i18n";
import type { ChatMessage } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ChatView() {
  const { t } = useT();
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

  // Request log sidebar state
  const [logSidebarCollapsed, setLogSidebarCollapsed] = useState(false);
  const [logSidebarClosed, setLogSidebarClosed] = useState(false);
  const [mobileLogOpen, setMobileLogOpen] = useState(false);

  // Developer console state
  const [devConsoleClosed, setDevConsoleClosed] = useState(false);

  const SUGGESTIONS = [
    { icon: Shield, text: t("chat", "suggestions.security"), color: "#f472b6" },
    { icon: Gauge, text: t("chat", "suggestions.performance"), color: "#34d399" },
    { icon: Network, text: t("chat", "suggestions.architecture"), color: "#a78bfa" },
    { icon: Code2, text: t("chat", "suggestions.refactor"), color: "#22d3ee" },
    { icon: Lightbulb, text: t("chat", "suggestions.feature"), color: "#fbbf24" },
  ];

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
    const topRisk = report.issues.security[0]?.title ?? t("chat", "noRisk");
    
    // Dynamic text replacement for the intro
    let introText = t("chat", "intro")
      .replace("{owner}", report.repoOwner)
      .replace("{name}", report.repoName)
      .replace("{overall}", String(report.scores.overall))
      .replace("{topRisk}", topRisk)
      .replace("{arch}", report.architecture.pattern);

    pushChat({
      id: crypto.randomUUID(),
      role: "assistant",
      content: introText,
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
      toast.error(t("chat", "analyzeFirstToast"));
      return;
    }

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content, createdAt: Date.now() };
    pushChat(userMsg);
    setInput("");
    setLoading(true);

    const personality = usePersonalityStore.getState().getActive();
    const providersState = useProvidersStore.getState();
    const providerInstance = providersState.getProviderForFeature("chat");
    const devMode = useDeveloperModeStore.getState();
    const language = useI18nStore.getState().locale;

    try {
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

      // Build AI config — Pro users get admin key, BYOK users get their own key
      const aiMode = useProvidersStore.getState().aiMode;
      const byokProvider = providerInstance?.apiKey ? providerInstance : undefined;
      const platformSelection = JSON.parse(localStorage.getItem("codeinsight-platform-selection") || "null");

      // Pro user with platform selection: send platformProvider + platformModel
      // BYOK user with key: send provider config
      const aiBody: Record<string, any> = {};
      if (platformSelection && (!byokProvider || aiMode === "platform")) {
        aiBody.platformProvider = platformSelection.providerId;
        aiBody.platformModel = platformSelection.model;
        aiBody.aiMode = "platform";
      } else if (byokProvider) {
        aiBody.provider = {
          providerId: byokProvider.providerId,
          label: byokProvider.label,
          model: byokProvider.model,
          baseUrl: byokProvider.baseUrl,
          temperature: byokProvider.temperature,
          maxTokens: byokProvider.maxTokens,
          streaming: byokProvider.streaming,
          timeout: byokProvider.timeout,
          apiKey: byokProvider.apiKey,
        };
        aiBody.aiMode = "byok";
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: aid,
          message: content,
          history,
          personality: {
            id: personality.id,
            name: personality.name,
            systemPrompt: personality.systemPrompt,
            temperature: personality.temperature,
            maxTokens: personality.maxTokens,
            preferredModel: personality.preferredModel,
          },
          language,
          debug: devMode.enabled,
          ...aiBody,
        }),
      });

      // Check if provider supports streaming (BYOK with streaming enabled, or Platform AI)
      // Free plan: streaming disabled (PLAN_LIMITS.free.streaming = false)
      // Use useSession hook at component level instead — get plan from session cookie
      const sessionRes = await fetch("/api/auth/session").then(r => r.json()).catch(() => ({}));
      const plan = sessionRes?.plan ?? "free";
      const role = sessionRes?.role ?? "user";
      const canStream = plan !== "free" || role === "admin";
      const useStreaming = canStream && (aiMode === "platform" || (providerInstance?.streaming && providerInstance?.apiKey));

      if (useStreaming) {
        // ── Streaming via SSE ──
        const streamRes = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisId: aid,
            message: content,
            history,
            personality: personality ? {
              id: personality.id,
              name: personality.name,
              systemPrompt: personality.systemPrompt,
              temperature: personality.temperature,
              maxTokens: personality.maxTokens,
              preferredModel: personality.preferredModel,
            } : undefined,
            language,
            debug: devMode.enabled,
            ...aiBody,
          }),
        });

        if (!streamRes.ok) throw new Error("Stream failed");

        // Create assistant message placeholder and update it as chunks arrive
        const assistantId = crypto.randomUUID();
        pushChat({ id: assistantId, role: "assistant", content: "", createdAt: Date.now() });

        const reader = streamRes.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullReply = "";
        let debugData: any = null;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              try {
                const data = JSON.parse(trimmed.slice(5).trim());
                if (data.error) throw new Error(data.error);
                if (data.chunk) {
                  fullReply += data.chunk;
                  // Update the assistant message in-place
                  const updated = useAppStore.getState().chat.map((m) =>
                    m.id === assistantId ? { ...m, content: fullReply } : m
                  );
                  setChat(updated);
                }
                // Capture debug metadata from done event
                if (data.done && data.debug) {
                  debugData = data.debug;
                }
              } catch { /* ignore */ }
            }
          }
        }

        // Fallback if streaming produced nothing
        if (!fullReply) {
          const updated = useAppStore.getState().chat.map((m) =>
            m.id === assistantId ? { ...m, content: "⚠️ Empty response. Please try again." } : m
          );
          setChat(updated);
        }

        // Log to developer mode (streaming path was missing this!)
        if (devMode.enabled && debugData?.log) {
          devMode.addLog(debugData.log);
          // Also create a snapshot for the Developer Panel
          devMode.addSnapshot({
            requestId: debugData.log.requestId,
            timestamp: debugData.log.timestamp,
            provider: debugData.log.provider,
            model: debugData.log.model,
            personality: debugData.log.personality,
            temperature: personality?.temperature ?? 0.7,
            maxTokens: personality?.maxTokens ?? 4096,
            streaming: true,
            contextWindow: 128000,
            systemPrompt: personality?.systemPrompt ?? "",
            userPrompt: content,
            repositoryContext: "",
            retrievedChunks: [],
            finalPrompt: "",
            inputTokens: debugData.log.inputTokens,
            outputTokens: debugData.log.outputTokens,
            totalTokens: debugData.log.totalTokens,
            queueMs: 0,
            generationMs: debugData.log.generationMs,
            totalMs: debugData.log.durationMs,
            capabilities: { vision: false, toolCalling: true, functionCalling: true, reasoning: false },
            rawResponse: fullReply,
            formattedResponse: fullReply,
          } as any);
        }
      } else {
        // ── Non-streaming (fallback) ──
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? t("chat", "error"));

        pushChat(data.message ?? { id: crypto.randomUUID(), role: "assistant", content: data.reply, createdAt: Date.now() });

        if (devMode.enabled && data.debug) {
          devMode.addSnapshot(data.debug);
          if (data.debug.log) devMode.addLog(data.debug.log);
        }
      }
    } catch (e) {
      console.error(e);
      toast.error(t("chat", "chatFailedToast"));
      pushChat({
        id: crypto.randomUUID(),
        role: "assistant",
        content: t("chat", "errorReply"),
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
          <h2 className="mt-4 text-xl font-bold">{t("chat", "noRepo")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("chat", "noRepoDesc")}
          </p>
          <Button onClick={() => setView("analyze")} className="mt-4 bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
            <Sparkles className="mr-1.5 h-4 w-4" /> {t("chat", "analyzeFirst")}
          </Button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] px-2 py-3 md:px-4 md:py-4">
      {/* Chat area — flexes to fill remaining space */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="mx-auto flex h-full w-full max-w-4xl flex-col px-2 md:px-4">
          {/* header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/30 to-violet-500/30">
                <Bot className="h-5 w-5 text-cyan-300" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-400" />
              </div>
              <div>
                <h1 className="text-sm font-semibold">{t("chat", "title")}</h1>
                <p className="text-[11px] text-muted-foreground">
                  <FolderGit2 className="mr-1 inline h-3 w-3" />
                  {report.repoOwner}/{report.repoName}
                </p>
              </div>
              <button
                onClick={() => useAppStore.getState().setView("personalities")}
                className="ml-2 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] transition hover:border-cyan-400/40"
                title={t("chat", "personalityLabel")}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: activePersonality.accent }} />
                <span className="font-medium">{activePersonality.name}</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => { clearChat(); toast.success(t("chat", "clearToast")); }}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {t("chat", "clear")}
              </Button>
            </div>
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
              <span className="text-sm text-muted-foreground">{t("chat", "thinking")}</span>
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
            <p className="px-1 text-xs uppercase tracking-wider text-muted-foreground">{t("chat", "tryAsking")}</p>
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
              placeholder={t("chat", "placeholder")}
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
          {t("chat", "footerNote")}
        </p>
      </div>
        </div>
      </div>

      {/* Right sidebar: Developer Console (replaces old RequestLogSidebar) */}
      <DeveloperConsole
        snapshot={latestSnapshot}
        closed={devConsoleClosed}
        onClose={() => setDevConsoleClosed(false)}
      />
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

/* Lightweight markdown renderer */
function MarkdownLite({ content }: { content: string }) {
  const blocks = parseCodeBlocks(content);
  return (
    <div className="space-y-1.5">
      {blocks.map((block, i) => {
        if (block.type === "code") {
          return <CodeBlock key={i} code={block.content} lang={block.lang || "text"} />;
        }
        // It's text — render line by line
        const lines = block.content.split("\n");
        return (
          <div key={i} className="space-y-1.5">
            {lines.map((line, j) => {
              const key = `${i}-${j}`;
              if (line.startsWith("### ")) return <h4 key={key} className="mt-2 text-sm font-bold">{renderInline(line.slice(4))}</h4>;
              if (line.startsWith("## ")) return <h3 key={key} className="mt-2 text-base font-bold">{renderInline(line.slice(3))}</h3>;
              if (line.startsWith("# ")) return <h2 key={key} className="mt-2 text-lg font-bold">{renderInline(line.slice(2))}</h2>;
              if (line.startsWith("- ") || line.startsWith("* ")) {
                return (
                  <div key={key} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan-400" />
                    <span>{renderInline(line.slice(2))}</span>
                  </div>
                );
              }
              if (line.startsWith("> ")) {
                return <blockquote key={key} className="border-l-2 border-cyan-400/40 pl-3 text-muted-foreground">{renderInline(line.slice(2))}</blockquote>;
              }
              if (line.trim() === "") return <div key={key} className="h-1" />;
              return <p key={key} className="leading-relaxed">{renderInline(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

// Parse content into text blocks and code blocks
function parseCodeBlocks(content: string): { type: "text" | "code"; content: string; lang?: string }[] {
  const blocks: { type: "text" | "code"; content: string; lang?: string }[] = [];
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(content)) !== null) {
    if (m.index > last) {
      blocks.push({ type: "text", content: content.slice(last, m.index) });
    }
    blocks.push({ type: "code", lang: m[1] || "text", content: m[2].trim() });
    last = m.index + m[0].length;
  }
  if (last < content.length) {
    blocks.push({ type: "text", content: content.slice(last) });
  }
  return blocks.length > 0 ? blocks : [{ type: "text", content }];
}

// Code block with copy button + syntax highlighting
function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="my-2 overflow-hidden rounded-xl border border-white/10 bg-black/40">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{lang}</span>
        <button onClick={copy} className="flex items-center gap-1 text-[10px] text-muted-foreground transition hover:text-cyan-300">
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[12px] leading-relaxed scrollbar-thin">
        <code className="font-mono text-cyan-100/90">{code}</code>
      </pre>
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
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