"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRef, useState } from "react";
import {
  Bot,
  Briefcase,
  Smile,
  Code2,
  Crown,
  GraduationCap,
  Plus,
  Trash2,
  Copy,
  Pencil,
  Check,
  X,
  Download,
  Upload,
  Sparkles,
  Thermometer,
  Hash,
  Cpu,
  Star,
  FileText,
} from "lucide-react";
import { GlassCard, GradientText, NeonDivider } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePersonalityStore } from "@/lib/personality-store";
import { BUILTIN_PERSONALITIES, LUCIDE_ICON_NAMES } from "@/lib/personalities";
import type { Personality } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Local icon map (avoids dynamic lucide import by name)
const ICONS: Record<string, typeof Bot> = {
  briefcase: Briefcase,
  smile: Smile,
  "code-2": Code2,
  crown: Crown,
  "graduation-cap": GraduationCap,
  bot: Bot,
};

function iconFor(name: string): typeof Bot {
  return ICONS[name] ?? Bot;
}

// Render an icon by name without creating a component during render.
function PersonalityIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  switch (name) {
    case "briefcase": return <Briefcase className={className} style={style} />;
    case "smile": return <Smile className={className} style={style} />;
    case "code-2": return <Code2 className={className} style={style} />;
    case "crown": return <Crown className={className} style={style} />;
    case "graduation-cap": return <GraduationCap className={className} style={style} />;
    case "bot": return <Bot className={className} style={style} />;
    default: return <Bot className={className} style={style} />;
  }
}

export function PersonalitiesView() {
  const custom = usePersonalityStore((s) => s.custom);
  const activeId = usePersonalityStore((s) => s.activeId);
  const defaultId = usePersonalityStore((s) => s.defaultId);
  const setActive = usePersonalityStore((s) => s.setActive);
  const setDefault = usePersonalityStore((s) => s.setDefault);
  const removeCustom = usePersonalityStore((s) => s.removeCustom);
  const duplicateCustom = usePersonalityStore((s) => s.duplicateCustom);
  const exportPersonalities = usePersonalityStore((s) => s.exportPersonalities);
  const importPersonalities = usePersonalityStore((s) => s.importPersonalities);

  const [editing, setEditing] = useState<Personality | null>(null);
  const [preview, setPreview] = useState<Personality | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const all: Personality[] = [...BUILTIN_PERSONALITIES, ...custom];

  const handleExport = () => {
    const data = JSON.stringify({ personalities: exportPersonalities() }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "codeinsight-personalities.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Personalities exported");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        const list = (data.personalities ?? data) as Personality[];
        const n = importPersonalities(list);
        toast.success(`Imported ${n} custom ${n === 1 ? "personality" : "personalities"}`);
      } catch {
        toast.error("Invalid JSON file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bot className="h-4 w-4 text-cyan-300" />
            <span>AI Personality System</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold md:text-3xl">
            AI <GradientText>Personalities</GradientText>
          </h1>
          <p className="text-sm text-muted-foreground">
            Customize how the AI behaves across chat, code review, bug analysis, docs, and architecture.
            The selected personality injects its system prompt before every AI request.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={handleImport} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1.5 h-4 w-4" /> Import
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={custom.length === 0}>
            <Download className="mr-1.5 h-4 w-4" /> Export
          </Button>
          <Button
            onClick={() => setEditing(makeBlankCustom())}
            className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
          >
            <Plus className="mr-1.5 h-4 w-4" /> New Personality
          </Button>
        </div>
      </motion.div>

      {/* Active + Default quick stats */}
      <div className="grid gap-3 sm:grid-cols-2">
        <GlassCard className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-300">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active personality</p>
            <p className="text-sm font-semibold">{all.find((p) => p.id === activeId)?.name ?? "—"}</p>
          </div>
        </GlassCard>
        <GlassCard className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300">
            <Star className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Default for new chats</p>
            <p className="text-sm font-semibold">{all.find((p) => p.id === defaultId)?.name ?? "—"}</p>
          </div>
        </GlassCard>
      </div>

      {/* Personality grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {all.map((p, i) => {
          const Icon = iconFor(p.icon);
          const isActive = p.id === activeId;
          const isDefault = p.id === defaultId;
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <GlassCard
                hover
                className={cn(
                  "relative h-full overflow-hidden p-5",
                  isActive && "neon-border-cyan"
                )}
              >
                {isActive && (
                  <div className="absolute -right-8 top-5 rotate-45 bg-gradient-to-r from-cyan-500 to-violet-500 px-10 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Active
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `${p.accent}1a`, color: p.accent, border: `1px solid ${p.accent}33` }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-base font-semibold">{p.name}</h3>
                      {p.builtin ? (
                        <Badge variant="outline" className="h-4 text-[9px]">built-in</Badge>
                      ) : (
                        <Badge variant="outline" className="h-4 text-[9px] border-violet-400/40 text-violet-300">custom</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                  </div>
                </div>

                {/* tags */}
                <div className="mt-3 flex flex-wrap gap-1">
                  {p.tags.map((t) => (
                    <span key={t} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] text-muted-foreground">{t}</span>
                  ))}
                </div>

                {/* params */}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Thermometer className="h-3 w-3" />temp {p.temperature.toFixed(2)}</span>
                  <span className="flex items-center gap-1"><Hash className="h-3 w-3" />tokens {p.maxTokens === -1 ? "∞" : p.maxTokens}</span>
                  {p.preferredModel && <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{p.preferredModel}</span>}
                </div>

                <NeonDivider className="my-3" />

                {/* actions */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {!isActive && (
                    <Button size="sm" variant="default" className="h-7 bg-gradient-to-r from-cyan-500 to-violet-500 px-2.5 text-xs text-white" onClick={() => setActive(p.id)}>
                      <Check className="mr-1 h-3 w-3" /> Use
                    </Button>
                  )}
                  {!isDefault && (
                    <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => { setDefault(p.id); toast.success(`${p.name} set as default`); }}>
                      <Star className="mr-1 h-3 w-3" /> Default
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs" onClick={() => setPreview(p)}>
                    <FileText className="h-3 w-3" /> Preview
                  </Button>
                  {!p.builtin && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(p)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { duplicateCustom(p.id); toast.success("Duplicated"); }}>
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-rose-400 hover:text-rose-300" onClick={() => { removeCustom(p.id); toast.success("Deleted"); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      {/* Editor dialog */}
      <AnimatePresence>
        {editing && (
          <PersonalityEditor
            key={editing.id}
            personality={editing}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>

      {/* Preview dialog */}
      <AnimatePresence>
        {preview && (
          <PreviewDialog personality={preview} onClose={() => setPreview(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Editor ---------- */
function makeBlankCustom(): Personality {
  return {
    id: "",
    name: "",
    description: "",
    systemPrompt: "",
    temperature: 0.7,
    maxTokens: -1,
    preferredModel: "",
    accent: "#a78bfa",
    icon: "bot",
    builtin: false,
    tags: [],
    preview: "",
  };
}

function PersonalityEditor({ personality, onClose }: { personality: Personality; onClose: () => void }) {
  const addCustom = usePersonalityStore((s) => s.addCustom);
  const updateCustom = usePersonalityStore((s) => s.updateCustom);
  const [draft, setDraft] = useState<Personality>(personality);
  const isEdit = !!personality.id;

  const save = () => {
    if (!draft.name.trim() || !draft.systemPrompt.trim()) {
      toast.error("Name and system prompt are required");
      return;
    }
    const tags = draft.tags.length ? draft.tags : ["custom"];
    if (isEdit) {
      updateCustom(draft.id, draft);
      toast.success("Personality updated");
    } else {
      addCustom({ ...draft, tags });
      toast.success("Personality created");
    }
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto border-white/10 bg-popover/95 backdrop-blur-2xl scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-cyan-300" />
            {isEdit ? "Edit personality" : "New custom personality"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Code Reviewer" className="bg-white/[0.03]" />
            </Field>
            <Field label="Icon">
              <Select value={draft.icon} onValueChange={(v) => setDraft({ ...draft, icon: v })}>
                <SelectTrigger className="bg-white/[0.03]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LUCIDE_ICON_NAMES.map((n) => {
                    const I = iconFor(n);
                    return (
                      <SelectItem key={n} value={n}>
                        <span className="flex items-center gap-2"><I className="h-3.5 w-3.5" /> {n}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Description">
            <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Short summary of how this personality behaves" className="bg-white/[0.03]" />
          </Field>
          <Field label="System Prompt" hint="injected before every AI request">
            <Textarea
              value={draft.systemPrompt}
              onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
              rows={8}
              placeholder="You are CodeInsight AI operating in [mode]..."
              className="bg-white/[0.03] font-mono text-xs"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Temperature · ${draft.temperature.toFixed(2)}`} hint="0 = deterministic, 2 = creative">
              <Slider value={[draft.temperature]} min={0} max={2} step={0.05} onValueChange={([v]) => setDraft({ ...draft, temperature: v })} />
            </Field>
            <Field label="Max tokens" hint="-1 = unlimited">
              <Input type="number" value={draft.maxTokens} onChange={(e) => setDraft({ ...draft, maxTokens: Number(e.target.value) })} className="bg-white/[0.03]" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Preferred model (optional)">
              <Input value={draft.preferredModel ?? ""} onChange={(e) => setDraft({ ...draft, preferredModel: e.target.value })} placeholder="gpt-4o" className="bg-white/[0.03]" />
            </Field>
            <Field label="Accent color">
              <div className="flex items-center gap-2">
                <input type="color" value={draft.accent} onChange={(e) => setDraft({ ...draft, accent: e.target.value })} className="h-9 w-12 rounded border border-white/10 bg-transparent" />
                <Input value={draft.accent} onChange={(e) => setDraft({ ...draft, accent: e.target.value })} className="bg-white/[0.03]" />
              </div>
            </Field>
          </div>
          <Field label="Tags (comma-separated)">
            <Input
              value={draft.tags.join(", ")}
              onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
              placeholder="concise, opinionated"
              className="bg-white/[0.03]"
            />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
            <Check className="mr-1.5 h-4 w-4" /> {isEdit ? "Save changes" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Preview ---------- */
function PreviewDialog({ personality, onClose }: { personality: Personality; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto border-white/10 bg-popover/95 backdrop-blur-2xl scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PersonalityIcon name={personality.icon} className="h-4 w-4" style={{ color: personality.accent }} />
            {personality.name} — Preview
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Description</p>
            <p className="mt-1 text-sm">{personality.description}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sample response</p>
            <div className="mt-1 rounded-lg border border-white/10 bg-black/40 p-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{personality.preview || "No preview available."}</p>
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">System prompt</p>
            <pre className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/5 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-foreground/80 scrollbar-thin">
{personality.systemPrompt}
            </pre>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {label}
        {hint && <span className="text-[10px] text-muted-foreground/70">· {hint}</span>}
      </label>
      {children}
    </div>
  );
}
