# Changelog

All notable changes to CodeInsight AI will be documented in this file.

## [0.3.0] — 2025-01-30

### Added
- **Diagram Engine v2** — 6 diagram types (UML, Sequence, ERD, Architecture, Module, Component) with unified Diagram Model, Provider Pattern, 4 layouts (dagre-TB/LR, circular, force), 3 export formats (SVG, Mermaid, PlantUML), interactive renderer (zoom/pan/focus/search/minimap), Query Engine (findPath/findCycles/findImpact), LRU cache, plugin architecture
- **Graph Engine v2** — GraphIndex (O(1) symbol lookup), GraphQuery (semantic query API), GraphImpact (structured ImpactReport with risk level), AIAnalysisService (separated from engine)
- **Code Explorer V2** — Expand Context, File Summary, Issue Highlighting, AI Context Optimization, Rich Static Explanation, 6 AI Modes (Explain/Security/Perf/Refactor/Tests/Bugs), Related Files, sessionStorage persist, Regenerate button
- **Unified Code Graph** — Merged Dependencies + CodeGraph tabs into single tab with 6 graph types
- **IssuesTab per-issue AI** — "Ask AI" button on each issue with sessionStorage persistence
- **Docs AI persistence** — AI-enhanced docs saved to sessionStorage
- **AI fallback UI** — 7 tabs show amber "AI Unavailable" when pass fails, cyan "AI Running" when pending
- **First-user auto-admin** — No ADMIN_EMAIL config needed; first user to sign in becomes admin

### Changed
- **i18n completion** — 21 namespaces, 2,300+ keys, full EN/VI parity, technical terms preserved
- **Honest naming** — Removed misleading "AI" labels from static content ("AI Summary" → "Summary")
- **AI prompt optimization** — Limited to top 5 issues by severity (was sending all 28-173 issues)
- **504 timeout fix** — Robust error handling for non-JSON responses

### Removed
- **Mission Control** — 100% removed (UI + backend + DB models + i18n + agents infrastructure)
- **Dead code** — Orphaned files, deprecated rate-limiter, unused imports

---

## [0.2.0] — 2025-01-15

### Added
- **Phase 1 (AI-first core)** — 9 AI passes, structured output (evidence/confidence/fixPlan), secret redaction (17 patterns), audit log (AICallLog), AI Overview card, action buttons (Fix Now/Test/Refactor with confirm dialog)
- **Phase 2 (Decision Intelligence)** — Symbol-level CodeGraph (calls/uses/extends edges), Timeline + diff, regression detection, enhanced roadmap (effort/deps/phases/ROI), refactor sequencer (graph-validated)
- **Phase 3 (Enterprise Hardening)** — Cost controls (token budget), rate limiting (DB-backed), model fallback (provider chain), policy engine (8 policies), PDF/JSON export, multi-tenant isolation

---

## [0.1.0] — 2024-12-01

### Added
- Initial release
- Static analysis engine (66 rules)
- 8 AI providers (BYOK)
- GitHub OAuth authentication
- Project report with 10 tabs
- AI chat with streaming
- i18n (Vietnamese + English)
