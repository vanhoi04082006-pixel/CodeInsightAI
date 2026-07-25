# Changelog

All notable changes to CodeInsight AI will be documented in this file.

## [1.0.0] — 2026-07-24

### Added
- **Hybrid Analyze**: Sync static analysis + async AI passes (8 passes, each <55s)
- **AI Pass Progress**: Real-time "AI Pass 3/8 — Security Review" UI
- **ShopAIKey**: 15th provider, default Platform AI (8 cost-effective models)
- **Model badges**: Each model shows use-case (Best for Analyze, Code, Chat, etc.)
- **Token tracking**: Free 1M/mo, Pro 10M/mo, widget in topbar + dashboard
- **Developer Console**: 6-tab IDE-grade inspection panel
- **Custom Cursor v3**: Exponential smoothing, ring buffer trail, adaptive quality
- **System Status Indicator**: Live health in topbar (DB, jobs, latency)
- **Keyboard Shortcuts Help**: Press `?` to see all shortcuts
- **User Guide**: `/guide` page with 8 sections
- **GitHub community**: SECURITY.md, CI, Dependabot, issue/PR templates
- **Dark mode default**: Cyber aesthetic, no FOWT

### Changed
- **Default mode**: New users start in Default (Platform AI), not Custom
- **Providers nav**: Locked in Default mode, unlocked in Custom mode
- **Landing page**: Replaced fake testimonials with real stats
- **Auth flow**: Landing CTA now calls `signIn("github")` directly
- **CSP**: Added ShopAIKey + Azure + raw.githubusercontent.com + WebSocket
- **maxDuration**: 300s → 120s (Hobby compatible)
- **reactStrictMode**: false → true
- **TypeScript**: Removed `ignoreBuildErrors` — 0 errors

### Removed
- **Fake analysis engine**: `analysis-engine.ts` (1115 lines) deleted
- **Google OAuth**: Removed completely (GitHub-only)
- **Dead code**: `useEffectiveAIConfig`, `getActiveJobs`, `parsedToReport`, `Field` component
- **In-memory repo cache**: Cross-user leak risk eliminated

### Fixed
- Multi-tenant data leak (GET /api/analyze not scoped by userId)
- Unauthenticated delete (DELETE /api/analyze no ownership check)
- Share link cursor invisible (global `cursor: none` without CustomCursor)
- AI Insights empty (model-specific maxTokens + 402 retry + JSON parser)
- "Job not found" on Vercel (DB fallback + individual AI pass calls)
- Analysis stuck at 0%/50%/85% (simulated progress + hybrid split)
- Vietnamese AI (language param now passed to all 8 AI passes)
- Dead code detection false positives (entry point whitelist + basename matching)
- 154 missing VI i18n keys in mission.json
- 18 TypeScript errors (surfaced after removing ignoreBuildErrors)

### Security
- All API routes authenticated + scoped by userId
- AES-256-GCM encryption for API keys
- Rate limiting (60/min general, 20/min analyze/chat)
- 7 security headers (CSP, HSTS, X-Frame-Options, etc.)
- Audit logging for admin actions
