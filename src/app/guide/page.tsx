import { Metadata } from "next";

export const metadata: Metadata = {
  title: "User Guide — CodeInsight AI",
  description: "Complete guide to using CodeInsight AI: analyze repos, AI chat, Mission Control, settings, and more.",
};

const GUIDE_SECTIONS = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: "🚀",
    content: `
## Getting Started

CodeInsight AI is an AI-powered code intelligence platform. Paste a GitHub URL, and AI analyzes the entire repository — security, performance, architecture, code quality, and more.

### Quick Start
1. **Sign in** with GitHub (required for analysis)
2. **Paste a repo URL** (e.g., \`https://github.com/facebook/react\`)
3. **Wait 15-30s** for static analysis
4. **AI deep analysis** runs automatically (2-5 min, 8 passes)
5. **Explore** the dashboard, AI insights, CodeGraph, and chat

### Two Modes
| Mode | Who | Cost |
|------|-----|------|
| **Default** | Everyone | Free: 1M tokens/mo, Pro: 10M tokens/mo |
| **Custom (BYOK)** | Power users | Unlimited (your own API key) |

New users default to **Default mode** — no setup needed.
`,
  },
  {
    id: "analyze",
    title: "Analyze Repository",
    icon: "🔍",
    content: `
## Analyze Repository

### How to Analyze
1. Go to **Analyze** tab (⌘A)
2. Paste a GitHub URL (public or private)
3. Toggle **AI Analysis** on/off
4. Click **Analyze**

### What Happens
1. **Static Analysis** (15-30s): 66 rules scan for security, bugs, performance, architecture issues
2. **AI Deep Analysis** (2-5 min): 8 AI passes examine the code:
   - Executive Summary
   - Security Review
   - Architecture Review
   - Code Quality
   - Performance Review
   - Best Practices Audit
   - Priorities & Roadmap
   - Duplicate Code Detection

### Results
- **Dashboard**: Scores, charts, trends
- **Project Report**: Full analysis with tabs (Overview, Architecture, Bugs, Security, etc.)
- **AI Insights**: 7-pass deep analysis results
- **CodeGraph**: Visual dependency graph
- **AI Ask**: Chat with AI about the repository

### Tips
- Use \`force: true\` to re-analyze (bypasses 1-hour cache)
- Private repos require GitHub login
- Large repos (>200 files) are truncated
`,
  },
  {
    id: "dashboard",
    title: "Dashboard",
    icon: "📊",
    content: `
## Dashboard

The dashboard shows a summary of your latest analysis:

- **Score cards**: Security, Performance, Architecture, Maintainability, Code Quality
- **Score breakdown**: Radial chart of weighted scores
- **Languages**: Pie chart of language distribution
- **Activity trends**: 30-day analysis trends (if data available)
- **Token usage**: How many tokens used this month
- **Recent signups**: Latest users (admin only)
- **Top users**: Most active users (admin only)
- **System health**: DB, jobs, memory, latency

### Keyboard Shortcuts
- \`⌘D\` — Go to Dashboard
- \`⌘A\` — New analysis
- \`⌘K\` — Command palette
- \`?\` — Show all shortcuts
`,
  },
  {
    id: "ai-features",
    title: "AI Features",
    icon: "🤖",
    content: `
## AI Features

### AI Insights (7-pass Deep Analysis)
Available in the **AI Insights** tab of Project Report. Requires AI provider configured.

8 AI passes:
1. **Executive Summary** — Business impact overview
2. **Security Review** — Root cause + fix code for each vulnerability
3. **Architecture Review** — Strengths, weaknesses, suggestions
4. **Code Quality** — Bug analysis with fixes
5. **Performance Review** — Bottleneck analysis with expected improvements
6. **Best Practices Audit** — Framework-specific scoring (0-100)
7. **Priorities & Roadmap** — Ranked action items + phased plan
8. **Duplicate Code** — AI-powered logic/structural duplication detection

### AI Ask (Repository Chat)
Chat with AI about the analyzed repository. AI has full context:
- Repository structure, files, languages
- Static analysis results
- CodeGraph (semantic dependency graph)
- Conversation history

### Model Selection (Pro users)
Pro users can choose from 8 models:
| Model | Best for | Price |
|-------|---------|-------|
| gpt-5-nano | Budget (free default) | $0.05/$0.40 |
| gpt-4.1-nano | Fast analysis | $0.10/$0.40 |
| gpt-4o-mini | Vision + multimodal | $0.15/$0.60 |
| gpt-5-mini | Chat | $0.25/$2.00 |
| **gpt-4.1-mini** | **Analyze (Pro default)** | **$0.40/$1.60** |
| grok-4-fast-reasoning | Fast reasoning | $0.20/$0.50 |
| deepseek-chat | Code specialist | $2.00/$3.00 |
| qwen3-coder-flash | Code specialist | $1.00/$4.00 |
`,
  },
  {
    id: "settings",
    title: "Settings",
    icon: "⚙️",
    content: `
## Settings

### AI Mode
- **Default (Platform AI)**: Use admin's API key. No setup needed.
  - Free: 1M tokens/month, 1 model
  - Pro: 10M tokens/month, 8 models
- **Custom (BYOK)**: Use your own API key. Unlimited tokens.
  - Configure in Providers view (unlocked when Custom mode is active)

### Theme
- **Dark** (default): Cyber aesthetic with neon accents
- **Light**: Clean white background
- **System**: Follow OS preference

### Language
- **English**: Full support
- **Tiếng Việt**: Full support (including AI insights)

### Personalization
- Accent color (8 options)
- Font size (3 levels)
- UI density (3 levels)
- Animation level (3 levels)
- High contrast mode
- Color blind mode
- Reduced motion

### Developer Mode
Enables:
- Developer Console (6 tabs: Overview, Prompt, Context, Runtime, Capabilities, Logs)
- Request/response logging
- Debug snapshots
`,
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    icon: "🔧",
    content: `
## Troubleshooting

### Analysis fails with "Repository not found"
- Check if the repo URL is correct
- Private repos require GitHub login
- Anonymous rate limit: 60 requests/hour (sign in for 5000/hour)

### AI Insights show "Static Analysis Only"
- No AI provider configured
- Check: Admin → AI Config has at least one enabled provider
- Or: Switch to Custom mode and add your own API key

### AI passes fail with "402 credits"
- OpenRouter free tier exhausted
- Add credits at openrouter.ai/settings/credits
- Or: Use ShopAIKey (cheaper) or BYOK with your own key

### Progress stuck at 85-95%
- AI analysis is running (2-5 minutes for 8 passes)
- Each pass shows progress: "AI Pass 3/8 — Security Review"
- If stuck >6 minutes: check Vercel function logs

### Cursor invisible on shared report pages
- Fixed: CustomCursor now mounts on all pages
- If issue persists: clear localStorage and refresh

### "Job not found" error
- Fixed: DB fallback checks for completed analysis
- If persists: check Vercel function logs for background AI errors

### Chat returns empty response
- Check AI provider configuration
- Try switching model
- Check token usage (may be exceeded)
`,
  },
  {
    id: "shortcuts",
    title: "Keyboard Shortcuts",
    icon: "⌨️",
    content: `
## Keyboard Shortcuts

### Navigation
| Shortcut | Action |
|----------|--------|
| \`⌘K\` | Command palette |
| \`⌘D\` | Dashboard |
| \`⌘A\` | New analysis |
| \`⌘P\` | Providers |
| \`⌘H\` | History |
| \`⌘M\` | Mission Control (Pro) |
| \`⌘C\` | Chat (when no text selected) |
| \`⌘,\` | Settings |
| \`Esc\` | Back to landing |

### Vim-style (no modifier)
| Keys | Action |
|------|--------|
| \`g\` then \`d\` | Dashboard |
| \`g\` then \`a\` | Analyze |
| \`g\` then \`p\` | Project |
| \`g\` then \`c\` | Chat |
| \`g\` then \`h\` | History |
| \`g\` then \`s\` | Settings |
| \`g\` then \`m\` | Mission |
| \`g\` then \`l\` | Landing |

### Other
| Key | Action |
|-----|--------|
| \`?\` | Show keyboard shortcuts help |
| \`Esc\` | Blur input / close dialog |
`,
  },
  {
    id: "faq",
    title: "FAQ",
    icon: "❓",
    content: `
## FAQ

### Is CodeInsight AI free?
Yes! Free tier includes 5 analyses/month, 50 chat messages, and 1M AI tokens. Upgrade to Pro ($9/mo) for 100 analyses, 2000 chats, and 10M tokens.

### Do I need an API key?
No! Default mode uses admin's API key (ShopAIKey). You only need your own key if you switch to Custom mode (BYOK).

### Can I analyze private repos?
Yes, sign in with GitHub. Your GitHub token is used to fetch private repos you have access to.

### How accurate is the AI analysis?
The 7-pass AI analysis uses real LLM calls (not templates). Each pass examines actual code issues, architecture, and patterns. Accuracy depends on the model selected.

### Is my code sent to AI?
Yes — file paths, issue titles, and repository metadata are sent to the AI provider for deep analysis. File content is NOT sent (only metadata). BYOK users control their own data.

### Can I share analysis results?
Yes! Use the Share button in Project Report to generate a read-only share link. Links expire after 7 days.

### What languages are supported?
CodeInsight AI analyzes 25+ programming languages including TypeScript, JavaScript, Python, Go, Rust, Java, C#, C++, PHP, Ruby, Swift, Kotlin, and more.

### Can I use my own AI model?
Yes! Custom mode (BYOK) supports 15 providers including OpenAI, Anthropic, Gemini, DeepSeek, Groq, Ollama, and more. You can also set per-feature routing (e.g., security→Claude, chat→GPT).
`,
  },
];

export default function GuidePage() {
  return (
    <div className="relative min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold md:text-4xl">
            User <span className="text-gradient-aurora">Guide</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Everything you need to know about CodeInsight AI
          </p>
        </div>

        {/* Quick nav */}
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {GUIDE_SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs transition hover:border-cyan-400/30 hover:bg-cyan-500/10 hover:text-cyan-300"
            >
              {s.icon} {s.title}
            </a>
          ))}
        </div>

        {/* Content */}
        <div className="space-y-12">
          {GUIDE_SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-20">
              <div className="glass-card rounded-2xl p-6 md:p-8">
                <div className="prose prose-invert max-w-none">
                  <h2 className="flex items-center gap-2 text-xl font-bold md:text-2xl">
                    <span>{section.icon}</span>
                    {section.title}
                  </h2>
                  <div className="mt-4 space-y-3 text-sm leading-relaxed text-foreground/80">
                    {section.content.split("\n").map((line, i) => {
                      if (line.startsWith("## ")) return <h3 key={i} className="mt-4 text-base font-semibold text-foreground">{line.replace("## ", "")}</h3>;
                      if (line.startsWith("| ")) return <pre key={i} className="overflow-x-auto rounded-lg bg-black/30 p-2 text-xs">{line}</pre>;
                      if (line.startsWith("- ")) return <p key={i} className="ml-4 text-xs">• {line.replace("- ", "")}</p>;
                      if (line.trim() === "") return <br key={i} />;
                      return <p key={i} className="text-xs">{line}</p>;
                    })}
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>

        {/* Back to app */}
        <div className="mt-12 text-center">
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            ← Back to CodeInsight AI
          </a>
        </div>
      </div>
    </div>
  );
}
