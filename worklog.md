# CodeInsight AI — Project Worklog

## Project Overview
**CodeInsight AI** — "Paste a GitHub Repository. AI Understands Everything."

A production-grade, futuristic SaaS web app that analyzes GitHub repositories with AI: cloning, scanning, dependency graphs, security/performance/bug analysis, and an AI CTO chat. Built with Next.js 16, React 19, TypeScript, Tailwind CSS 4, React Three Fiber, Framer Motion, Prisma (SQLite), and the z-ai-web-dev-sdk LLM.

---

## Current Project Status: ✅ Fully Functional (v1.0)

The application is complete and verified end-to-end via agent-browser + direct API testing. All core user flows work.

### Completed Features
- **Landing page**: animated 3D AI Core (R3F: distorted icosahedron, particle starfield, bloom, chromatic aberration, mouse parallax), hero with repo URL input, features grid, how-it-works pipeline, testimonials, pricing preview, FAQ accordion, CTA, footer.
- **App shell**: collapsible glass sidebar with nav, sticky topbar with ⌘K command palette, mobile bottom nav, animated neural-network canvas background, sticky footer.
- **Analyze flow**: URL input → 8-stage animated pipeline (Clone, Scan, AST, Dependency Graph, Embeddings, Static Analysis, AI Analysis, Reports) with per-stage progress, live log terminal, active 3D core → completion screen with score grid.
- **Dashboard**: overall health gauge, 5 score cards with deltas, score-breakdown radial chart, language pie chart, complexity trend area chart, commit activity bar chart, frameworks list, top-issues list.
- **Project Report** (8 tabs): Overview (gauge + breakdown + key files), Architecture (pattern, layers, strengths/weaknesses), Bugs, Security, Performance (expandable issue cards with AI recommendations + severity badges), Dependencies (interactive zoom/pan graph with node inspector + circular-dep detection), Docs (generated README + API docs with copy), Roadmap (features + monetization + tech debt).
- **AI Chat**: real LLM integration via z-ai-web-dev-sdk. System prompt positions AI as Staff Engineer / Security Expert / CTO. Builds rich context from the report (scores, files, issues, architecture). Markdown rendering, suggestion chips, typing indicator, persists messages to DB.
- **History**: list of past analyses from DB with mini-scores, language bars, search filter, click to reload.
- **Settings**: account, AI model picker (GPT-4o/Claude/Gemini/DeepSeek), analysis-depth toggles, notifications, theme picker.
- **Pricing**: 3 plans, monthly/yearly toggle, comparison table, enterprise CTA.
- **Design**: glassmorphism, neon cyan/violet/pink accents, animated gradients, grid background, noise, custom scrollbars, framer-motion page transitions + micro-interactions. Dark theme. Responsive (mobile bottom nav).

### Architecture
- Single `/` route (per constraints) with Zustand state-based view switching (landing/dashboard/analyze/project/chat/history/settings/pricing).
- **API routes** (Next.js Route Handlers, Node runtime): `/api/analyze` (POST generate+persist, GET list), `/api/report` (GET full report by id), `/api/chat` (POST → z-ai-web-dev-sdk LLM with repo context, persists messages), `/api/history` (GET list, POST single with messages).
- **Prisma schema**: `Analysis` (scores, metadata, full report JSON, languages/frameworks JSON), `ChatMessage` (role/content, cascade delete).
- **Analysis engine** (`src/lib/analysis-engine.ts`): seeded PRNG (mulberry32) generates deterministic, realistic reports from repo URL. Curated profiles for react/next/vue + generic. Builds scores, languages, frameworks, dependency graph (nodes/edges/circular), issues (bugs/security/performance with severity, file, line, recommendation, effort), files, architecture layers, tech debt, roadmap, monetization, generated docs.
- **3D**: `src/components/3d/ai-core.tsx` — R3F Canvas, distorted icosahedron + inner sphere + 2 torus rings + Sparkles + 600-particle starfield + mouse-parallax camera (lerp) + Bloom + ChromaticAberration postprocessing. `active` prop speeds up animation during analysis.

### Verification Results (agent-browser + curl)
- ✅ Landing renders: hero, 3D core, features, pricing, FAQ all present.
- ✅ Analyze pipeline: 8 stages animate, progress %, live log, completes in ~16s.
- ✅ Completion screen: scores (Overall 84, Security 95, Performance 72, Architecture 91, Maintainability 82, Code Quality 76), file/line counts.
- ✅ Project Report: all 8 tabs render, issue counts, health gauge, tags, summary.
- ✅ AI Chat (LLM via curl): returns detailed senior-level analysis referencing specific files (e.g. "Hardcoded API key in `config/database.ts` line 78", "Unescaped HTML in `src/components/Header.tsx` line 164").
- ✅ History API: persists and returns analyses.
- ✅ No lint errors. No runtime errors in dev log.

### Known Issue / Environment Constraint
- **Dev server persistence**: The sandbox kills background processes (including `setsid`/`nohup`/`disown` watchdogs) between bash tool calls. A `watch-dev.sh` respawn loop is in place; the 15-min cron `webDevReview` job also restarts/verifies. The user-facing Preview Panel is served through the Caddy gateway on port 81 → localhost:3000.

---

## File Structure
```
src/
  app/
    api/
      analyze/route.ts     # POST generate+persist, GET list
      report/route.ts      # GET full report by id
      chat/route.ts        # POST → z-ai LLM + persist
      history/route.ts     # GET list, POST single
    globals.css            # futuristic dark theme, glass, neon, animations
    layout.tsx             # fonts, providers, Toaster
    page.tsx               # view orchestrator + shell + footer
  components/
    3d/ai-core.tsx         # R3F 3D AI Core
    shared/
      ui.tsx               # GlassCard, ScoreGauge, SeverityBadge, etc.
      animated-background.tsx  # neural-network canvas
      app-shell.tsx        # sidebar, topbar, mobile nav
      command-palette.tsx  # ⌘K
      dependency-graph.tsx # interactive SVG graph
    views/
      landing-view.tsx     # hero + features + pricing + FAQ + testimonials
      dashboard-view.tsx   # scores + charts
      analyze-view.tsx     # URL input + pipeline + completion
      project-view.tsx     # 8-tab report
      chat-view.tsx        # AI CTO chat
      history-view.tsx     # past analyses
      settings-view.tsx    # preferences
      pricing-view.tsx     # plans + comparison
    providers.tsx          # TanStack Query
  lib/
    types.ts               # domain types
    analysis-engine.ts     # seeded report generator
    store.ts               # Zustand nav/analysis state
    db.ts                  # Prisma client
prisma/schema.prisma       # Analysis + ChatMessage
start-dev.sh / watch-dev.sh  # server launchers
```

---

## Unresolved Issues / Risks
1. **Dev server persistence across bash calls** — sandbox reaps processes. Mitigated by watchdog + cron. If preview is blank, run `cd /home/z/my-project && nohup setsid ./watch-dev.sh </dev/null >/dev/null 2>&1 &`.
2. **Analysis is simulated** — the engine generates deterministic realistic reports rather than actually cloning GitHub repos (sandbox has no outbound git). The LLM chat is real and reasons over the generated report context. A future phase could integrate real GitHub clone+parse if network access is available.
3. **Chat session continuity** — chat is client-side (Zustand) + persisted to DB per analysisId. On reload the in-memory chat clears (DB history loads only via history view, not auto-restored into chat). Could add chat restore on analysis load.

## Priority Recommendations for Next Phase
1. **Real GitHub integration**: use GitHub API to fetch repo metadata (stars, language stats, README) to enrich the report instead of pure simulation.
2. **Chat restore**: load persisted ChatMessages when reopening an analysis from History into the Chat view.
3. **More charts/depth**: add maintainability trend, duplicate-code heatmap, dead-code list.
4. **Export**: wire PDF export (currently Markdown copy + share link toast).
5. **Auth**: wire NextAuth GitHub/Google OAuth (UI exists in Settings; backend not connected).
6. **More views polish**: UML/sequence/database diagrams in Docs tab.

---
Task ID: 1
Agent: Z.ai Code (main)
Task: Build CodeInsight AI — full futuristic AI GitHub repository analysis SaaS.

Work Log:
- Designed futuristic dark glassmorphism design system in globals.css (neon palette, glass utilities, animated gradients, grid bg, custom scrollbars).
- Defined Prisma schema (Analysis + ChatMessage) and pushed to SQLite.
- Built analysis-engine.ts: seeded PRNG generating deterministic reports (scores, languages, frameworks, dependency graph, issues, architecture, tech debt, roadmap, monetization, docs).
- Built 3D AI Core (R3F): distorted icosahedron, inner sphere, torus rings, sparkles, particle starfield, mouse-parallax camera, Bloom + ChromaticAberration.
- Built app shell: glass sidebar (collapsible), topbar with ⌘K command palette, mobile bottom nav, animated neural-network canvas background, sticky footer.
- Built all 8 views: Landing, Analyze (8-stage pipeline), Dashboard (charts), Project Report (8 tabs + interactive dependency graph), AI Chat (real LLM), History, Settings, Pricing.
- Built 4 API routes: analyze, report, chat (z-ai-web-dev-sdk LLM with repo context), history.
- Wired main page.tsx with AnimatePresence view transitions, providers, theme.
- Verified end-to-end via agent-browser (landing, pipeline, report) + curl (chat LLM returns senior-level file-referenced analysis).

Stage Summary:
- App is fully functional and verified. Lint clean. All core flows work.
- Dev server persistence handled via watchdog script + 15-min cron.
- Real LLM chat confirmed working with rich repo context.
- See "Priority Recommendations" above for next-phase work.

---
Task ID: 2
Agent: Z.ai Code (cron review — webDevReview)
Task: 15-min recurring review: assess status, QA test, fix bugs, add features & styling polish.

Work Log:
- Reviewed worklog v1.0. Server was down — restarted via `watch-dev.sh`.
- QA via agent-browser: landing renders, pipeline completes, report tabs present, chat LLM works via curl.
- Extended `AnalysisReport` type with: `snippets` (CodeSnippet[]), `diagrams` (DiagramSet: UML/sequence/ERD SVG), `deadCode`, `duplicates`, `maintainabilityTrend`, and `FileInsight` gained `snippet`/`duplicateGroup`/`isDeadCode` fields.
- Extended `analysis-engine.ts` generator: added `buildSnippets()` (5 curated TS/TSX code samples with explanations), `buildDiagrams()` (3 hand-crafted SVG diagrams: UML class diagram with User/Repository/Analysis entities, sequence diagram for auth flow, ER diagram for the DB schema), `buildDeadCode()`, `buildDuplicates()`, `buildMaintainabilityTrend()`.
- Created `src/components/shared/code-viewer.tsx`: IDE-style code explorer with file list sidebar, `react-syntax-highlighter` (vscDarkPlus theme) with line numbers, macOS-style title bar, copy button, and AI explanation panel.
- Added new "Code" tab to Project Report (9 tabs now) — renders the CodeViewer with 5 syntax-highlighted snippets.
- Enhanced "Docs" tab: added diagram switcher (UML / Sequence / ERD) rendering SVG markup via dangerouslySetInnerHTML, plus the existing README + API docs.
- Enhanced "Dependencies" tab: added Dead Code card (files with no inbound refs + reason) and Duplicate Code card (clusters with group ID + file list + line count).
- Enhanced Dashboard: added Maintainability Trend line chart (8-month, recharts LineChart) + Code Hygiene card with dead code / duplicate / circular dep counts.
- Chat restore: extended Zustand store with `activeAnalysisId` + `setChat`. Chat view now fetches persisted messages from `/api/history` on load if an analysisId exists, falling back to seeding the intro. Analyze-view stores the returned analysisId; History-view sets it when opening a past analysis.
- Landing page styling polish: added AnimatedCounter component (IntersectionObserver-triggered, easeOutExpo) rendering 4 stats (Developers 2400+, Lines analysed 185000+, Uptime 99.9%, Avg analysis 60s) with neon glow. Added tech logo marquee (12 techs: TS/React/Next/Node/Python/Go/Rust/Vue/Postgres/Docker/AWS/GraphQL) with CSS `marquee` keyframe animation and fade-mask edges.
- Added `marquee` keyframe + mask-fade-x utility to globals.css.
- Verified via API (curl): report returns snippets(5), diagrams(uml/sequence/erd), deadCode(3), duplicates(2), maintainabilityTrend(8). Verified via agent-browser: Code tab active + "AI Code Explorer" + "Session Verification" snippet render + `<pre>` present; Docs tab has 49 SVGs (diagrams); Landing has stats bar + marquee in DOM.
- Lint clean (0 errors, 0 warnings).

Stage Summary:
- v1.1 shipped: 4 major new features (Code Explorer, Diagrams, Dead Code/Duplicates, Chat Restore) + 2 styling enhancements (animated stats, tech marquee).
- Project Report now has 9 tabs (was 8). Dashboard has 6 chart cards (was 4). Landing has stats + marquee sections.
- All new data flows through the existing API (`/api/analyze` returns the extended report JSON) — no schema migration needed (report stored as JSON blob).
- Dev server persistence remains the main environment constraint; watchdog + cron mitigate.
- Next-phase candidates: real GitHub API integration for live repo metadata, PDF export wiring, NextAuth OAuth backend, Compare-two-repos view.

---
Task ID: 3
Agent: Z.ai Code (architecture refactor — SaaS → local-first)
Task: Remove ALL SaaS functionality (pricing, subscriptions, billing, plans, upgrade buttons). Pivot to "Local-first AI Development Platform" with BYO AI provider keys. Replace Pricing page with AI Provider Dashboard supporting 14 providers.

Work Log:
- Replaced the `View` type: removed `"pricing"`, added `"providers"`. Added `AIProvider`, `ProviderPreset`, `ProviderId`, `FeatureKind` types.
- Created `src/lib/providers.ts`: 14 provider presets (OpenRouter, OpenAI, Anthropic, Gemini, DeepSeek, Groq, Ollama, LM Studio, Azure, Together, Fireworks, Mistral, xAI, Custom) each with name, category, default base URL, docs URL, default model, model catalog, requiresKey flag, accent color, local flag. Plus `FEATURE_LABELS` (9 features) and `FEATURE_DEFAULTS` (suggested default provider per feature).
- Created `src/lib/providers-store.ts`: Zustand store with `persist` middleware (localStorage, key `codeinsight-ai-providers`). Manages `providers: AIProvider[]` + `routing: FeatureKind → instanceId`. Actions: addProvider, updateProvider, removeProvider, setRouting, setProviderStatus, getProviderForFeature. Partializes to strip runtime status on persist.
- Created `src/components/views/providers-view.tsx` (replaces pricing-view.tsx): full AI Provider Dashboard with:
  • Header ("Local-first · Bring your own keys") + "Add AI Provider" button.
  • 4 stat cards: Enabled / Connected / Local Models / Avg latency.
  • Feature → Model Routing card: 9 features (chat, bugs, security, performance, architecture, docs, vision, refactor, summary) each with a Select to assign an enabled provider (falls back to the feature's default provider preset).
  • Provider cards: each shows avatar, label, live status badge (unknown/testing/connected/error), category, model, masked API key, latency, enable Switch, Test connection button, expandable config (Display label, Model select, API Key, Base URL, Temperature slider, Max tokens, Timeout slider, Streaming toggle, Remove button, "Get API key" docs link).
  • Add Provider dialog: grouped by Aggregator/Cloud/Local/Enterprise/Custom, shows all 14 presets as pickable cards.
  • Simulated connection test (latency + status) — wired for a future real `/api/providers/test` endpoint.
- Deleted `src/components/views/pricing-view.tsx` entirely.
- Refactored `src/components/views/landing-view.tsx`: removed the entire Pricing section (3 plan cards) and Testimonials. Replaced marketing copy throughout:
  • Badge: "Local-first · Bring your own AI · No subscriptions" (was "Powered by GPT-4o…").
  • Subtitle: "A local-first AI development platform. Connect your own AI APIs…" (was SaaS-y).
  • Trust strip: "Use your own AI APIs / Data stays with you / 60-second analysis / 14 providers supported" (was "Private repos / 4.9/5 from 2,400+ devs").
  • Stats bar: 14 AI providers / 40+ Languages / 0 Subscriptions / 60s Avg analysis (was Developers/Lines/Uptime).
  • New "Local-first Principles" section: 4 cards (Bring your own keys, You own your data, No subscriptions, Local models supported).
  • New "Multi-model routing" section: 6 feature→model example cards (Bug Detection→Claude, Chat→GPT-4o, Docs→DeepSeek, Vision→Gemini, Refactoring→Qwen, Security→Claude).
  • New "Supported providers" grid: all 14 presets as clickable cards → providers view.
  • Rewrote FAQ (6 Q&As) for local-first: "Do I need to pay?", "Where are my API keys stored?", "Can I use Ollama/LM Studio?", "Can I use different models for different tasks?", "Which providers are supported?", "Can I analyze private repositories?".
  • CTA: "Ready to connect your AI?" with "Connect Your AI" + "Analyze a repo" buttons (was "Analyze your first repo — free").
  • Removed PRICING constant, TESTIMONIALS, Star/Crown/Rocket imports.
- Updated `src/components/shared/app-shell.tsx`:
  • Nav: replaced `{ id: "pricing", label: "Pricing", icon: Crown }` with `{ id: "providers", label: "AI Providers", icon: Plug }`.
  • Removed the "Upgrade to Pro" sidebar card. Replaced with `AIStatusCard` showing live provider count (enabled/connected), a status dot (gray/amber/green), local-first copy ("Use your own AI APIs. No subscriptions." or "N connected · switch models freely"), and a dynamic button ("Add AI Provider" when none, else "Manage providers").
  • Topbar titleMap: `providers: "AI Providers"` (was pricing).
  • MobileNav filter: removed `&& n.id !== "pricing"` so providers shows on mobile.
- Updated `src/components/shared/command-palette.tsx`: replaced Pricing command with `{ id: "providers", label: "AI Providers", hint: "Connect your AI APIs", icon: Plug }`.
- Updated `src/app/page.tsx`: swapped `PricingView` import for `ProvidersView`. Landing top nav: "Pricing" → "AI Providers", "Start Analysis" → "Analyze Repo". Footer nav: "Pricing" → "AI Providers". View router: `view === "providers" && <ProvidersView />`.
- Updated `src/components/views/settings-view.tsx`: replaced the inline 4-model picker (GPT-4o/Claude/Gemini/DeepSeek radio cards) with a pointer card to the new Providers page ("Manage providers & model routing" → "Open Providers" button). Removed unused `model`/`setModel` state. Kept the Analysis-depth toggles. Added `ArrowRight` + `useAppStore` imports.
- Verified end-to-end via agent-browser + VLM:
  • Landing: "Local-first", "Use your own AI APIs", "14 providers supported", "Connect Your AI" CTA all present. NO "Start Free"/"Upgrade to Pro"/"No credit card" anywhere.
  • App shell: no "Pricing" or "Upgrade" text anywhere.
  • Providers view renders: heading + local-first messaging, 4 stat cards, Feature→Model Routing card (9 features), Add AI Provider button, empty state "Connect your AI".
  • Add Provider dialog opens with all 14 providers. Picking Anthropic adds it ("Anthropic (Claude)" appears, "of 1 added" stat updates). Test button present.
  • VLM confirmed all 5 dashboard elements visible with "dark, modern UI with purple/navy gradient".
- Lint clean (0 errors, 0 warnings). SaaS surface area grep returns 0 matches (only "Upgrade to TypeScript 5 strict mode" in a tech-debt item, which is legitimate).

Stage Summary:
- v2.0 shipped: complete architectural pivot from SaaS to local-first AI platform.
- Deleted: pricing-view.tsx, all plan/billing/upgrade UI, SaaS marketing copy.
- Added: AIProvider/ProviderPreset types, providers.ts (14 presets), providers-store.ts (persisted Zustand), providers-view.tsx (full dashboard + config + routing + connection test).
- Replaced: Pricing page → AI Provider Dashboard. Upgrade card → AI status card. Model picker → Providers link. All nav (sidebar/topbar/mobile/command-palette/footer) updated.
- Philosophy now: "Your keys. Your data. Your AI." — like Open WebUI / Continue.dev / VS Code AI extensions.
- 14 providers supported: OpenRouter, OpenAI, Anthropic, Gemini, DeepSeek, Groq, Ollama, LM Studio, Azure, Together, Fireworks, Mistral, xAI, Custom.
- Feature→model routing: 9 features each assignable to any enabled provider.
- Keys persisted to localStorage only (never sent to servers).
- Next-phase candidates: real `/api/providers/test` endpoint that actually pings each provider, wire the chat API to use the user's selected provider+model instead of the built-in z-ai SDK, streaming responses, import/export provider config.
