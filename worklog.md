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
