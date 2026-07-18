<div align="center">

# 🧠 CodeInsight AI

### Paste a GitHub Repository. AI Understands Everything.

**Local-first AI development platform** — phân tích GitHub repository như một Senior Staff Engineer. Bring your own AI keys, không subscription, không billing.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2d3748?logo=prisma)
![License](https://img.shields.io/badge/License-MIT-green)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)

</div>

---

## 📖 Mục lục

- [Giới thiệu](#-giới-thiệu)
- [✨ Tính năng](#-tính-năng)
- [🛠 Tech Stack](#-tech-stack)
- [🚀 Quick Start](#-quick-start)
- [⚙️ Cấu hình](#️-cấu-hình)
- [📁 Project Structure](#-project-structure)
- [🔍 Static Analyzers](#-static-analyzers)
- [🤖 AI Providers](#-ai-providers)
- [🌐 i18n](#-i18n)
- [🔐 Privacy](#-privacy)
- [🗺 Roadmap](#-roadmap)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

---

## 🎯 Giới thiệu

**CodeInsight AI** là một nền tảng phân tích codebase dùng AI, chạy local-first. Thay vì phải thuê Senior Staff Engineer review code, bạn paste URL GitHub repo vào — AI sẽ:

1. **Fetch toàn bộ file** từ GitHub API (hỗ trợ public + private repo qua OAuth).
2. **Parse AST** — trích xuất imports, exports, functions, classes, components, routes.
3. **Build dependency graph** với d3-force layout, detect circular deps + dead code.
4. **Run static analyzers** — Security (13 rules) + Bugs (11 rules) + Performance (42 rules) + Architecture (Robert C. Martin metrics).
5. **Generate diagrams** — UML, Sequence, ERD dạng SVG động từ dữ liệu thực.
6. **AI Chat** — chat với codebase như đang hỏi một Staff Engineer / Security Expert / CTO.

### Key Principles

| Principle | Mô tả |
|-----------|-------|
| **Local-first** | Mọi data lưu trong SQLite local. Không server trung gian. |
| **BYO AI** | Bring your own API keys — OpenRouter, OpenAI, Anthropic, Gemini, Ollama, v.v. |
| **No subscriptions** | Không billing, không rate limit, không feature lock. |
| **Privacy by design** | API keys chỉ lưu trong browser localStorage. Code chạy trực tiếp đến provider. |

---

## ✨ Tính năng

### 📊 Analysis Pipeline (8 stages)

| Stage | Mô tả |
|-------|-------|
| **1. Clone** | Fetch file tree từ GitHub API (recursive, ignore `node_modules`/`dist`/`vendor`...) |
| **2. Scan** | Lọc code files theo extension (.ts, .tsx, .js, .jsx, .py, .go, .rs, .vue, .svelte...) |
| **3. AST Parse** | Trích xuất imports, exports, functions, classes, interfaces, components, routes |
| **4. Dependency Graph** | Build import graph, resolve aliases (@/, ~/, ./, ../), DFS cycle detection |
| **5. Embeddings** | Semantic search với synonym expansion cho AI context |
| **6. Static Analysis** | Run 4 analyzers: Security, Bugs, Performance, Architecture |
| **7. AI Analysis** | AI reasoning over report context (personality-driven) |
| **8. Reports** | Generate README, API docs, architecture docs, folder guide, deployment guide |

### 🔍 Static Analyzers (66 rules tổng)

- **Security** (13 rules): hardcoded secrets, XSS, SQL injection, weak hashing, missing CSRF, insecure deserialization, path traversal, open redirects...
- **Bugs** (11 rules): race conditions, null derefs, off-by-one, unchecked promises, type coercion, mutable defaults, switch fallthrough...
- **Performance** (42 rules): bundle bloat (lodash/moment/underscore/rxjs/antd), memory leaks (setInterval/addEventListener/subscriptions), React anti-patterns (missing useMemo/useCallback, dangerouslySetInnerHTML, useEffect deps), N+1 queries, layout thrashing, blocking I/O...
- **Architecture**: Robert C. Martin component metrics (Instability, Abstractness, Distance from Main Sequence, Fan-in/Fan-out), layer violation detection, directory-level circular dep DFS, god module detection.

### 🎨 UI/UX

- **Glassmorphism dark theme** với neon cyan/violet/pink accents
- **3D AI Core** (React Three Fiber) — distorted icosahedron + particle starfield + Bloom postprocessing, adaptive theo accent color & animation level
- **Interactive dependency graph** — d3-force layout, pan/zoom, hover highlight, node inspector, circular dep highlighting
- **9 tabs Project Report** — Overview, Architecture, Bugs, Security, Performance, Dependencies, Code, Docs, Roadmap
- **Command palette** (⌘K) cho quick navigation
- **Animated background** — neural network canvas, grid-bg, gradient orbs
- **Framer Motion** micro-interactions ở mọi component

### 🤖 AI Personality System

5 built-in personalities + unlimited custom personalities:

| Personality | Role | Tone |
|-------------|------|------|
| **Professional** | Senior Engineer | Formal, precise |
| **Friendly** | Mentor | Warm, encouraging |
| **Technical** | Staff Engineer | Deep, technical |
| **CTO** | Tech Leader | Strategic, business-focused |
| **Teacher** | Educator | Step-by-step, pedagogical |

Mỗi personality có system prompt riêng, temperature, maxTokens, preferred model. Full CRUD + import/export JSON.

### 🛠 Developer Mode + Debug Panel

Toggle on để thấy:
- **Token usage** — input/output/total + cost estimate
- **Response time** — queue/generation/total ms, tokens/sec
- **Prompt debug** — system/user/repo-context/final prompt (secrets auto-masked)
- **Model debug** — vision/tool/function/reasoning capabilities
- **Raw response** — collapsible raw AI output
- **Advanced debug** — embeddings, vector search, chunk ranking, repo index, dep graph, static analysis, token cost
- **Request/Response logs** — capped at 50, với timestamp, request ID, duration, status, retries
- **Export** debug data as JSON/Markdown/TXT

Secret masking: tự động redact `sk-*`, `ghp_*`, `AIza*`, Bearer tokens, env-style assignments, và bất kỳ key nào tên `api_key`/`secret`/`token`/`password`.

### 🎨 Personalization

- **Theme**: Light / Dark / System (instant switch, no reload)
- **Accent**: 9 colors (cyan, violet, pink, emerald, amber, rose, blue, orange, teal)
- **Density**: Comfortable / Compact
- **Animation**: Ultra / Balanced / Performance (auto-detect low-end devices)
- **Font size**: sm / base / lg
- **Accessibility**: reduced motion, high contrast, color-blind modes (protanopia/deuteranopia/tritanopia)

### 🌐 i18n (English + Tiếng Việt)

- **SSR-safe** cookie-based — không hydration mismatch
- **13 namespaces**: common, settings, dashboard, analysis, landing, reports, errors, providers, personality, developer, history, chat, notifications
- **Browser auto-detection** lần đầu truy cập
- **LanguageSwitcher** ở topbar + Settings
- AI respond bằng ngôn ngữ đã chọn

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router) + React 19 |
| **Language** | TypeScript 5 (strict) |
| **Styling** | Tailwind CSS 4 + shadcn/ui (New York) |
| **3D** | React Three Fiber + Drei + postprocessing |
| **Animation** | Framer Motion |
| **Graph layout** | d3-force |
| **State** | Zustand (client) + TanStack Query (server) |
| **Database** | Prisma ORM + SQLite |
| **Auth** | NextAuth.js v4 (GitHub OAuth + Google OAuth) |
| **Icons** | Lucide React |
| **Toast** | Sonner |
| **LLM SDK** | z-ai-web-dev-sdk (built-in, override với providers của bạn) |

---

## 🚀 Quick Start

### Yêu cầu

- **Node.js** 18.18+ hoặc **Bun** 1.0+
- **Git**
- Một AI provider API key (OpenRouter recommended — free tier available)

### Cài đặt

```bash
# Clone repo
git clone https://github.com/vanhoi04082006-pixel/CodeInsightAI.git
cd CodeInsightAI

# Install dependencies
bun install
# hoặc: npm install / pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env — set DATABASE_URL, NEXTAUTH_SECRET

# Push database schema
bun run db:push

# Start dev server
bun run dev
```

Mở `http://localhost:3000` trong trình duyệt.

### Connect AI Provider đầu tiên

1. Vào **AI Providers** (sidebar)
2. Click **Add AI Provider**
3. Chọn provider (vd: OpenRouter)
4. Paste API key (lưu trong browser localStorage — không gửi đi đâu)
5. Toggle **enabled**, click **Test** để verify
6. (Optional) Route features: Bug Detection → Claude, Chat → GPT-4o...

### Phân tích repo đầu tiên

1. Paste URL GitHub repo (vd: `https://github.com/vercel/next.js`)
2. Click **Analyze Repo**
3. Đợi 8-stage pipeline chạy (~30-60s tùy repo size)
4. Xem report đầy đủ ở 9 tabs

---

## ⚙️ Cấu hình

### Environment Variables (`.env`)

```bash
# SQLite database location
DATABASE_URL=file:./db/custom.db

# NextAuth (mã hóa session — dùng chuỗi ngẫu nhiên)
NEXTAUTH_SECRET="your-random-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# GitHub OAuth (optional — để phân tích private repo)
# https://github.com/settings/developers
GITHUB_ID="your-github-oauth-client-id"
GITHUB_SECRET="your-github-oauth-client-secret"

# Google OAuth (optional)
# https://console.cloud.google.com/
GOOGLE_ID="your-google-oauth-client-id"
GOOGLE_SECRET="your-google-oauth-client-secret"
```

> **Lưu ý**: Không cần OAuth để chạy. App hoạt động full-featured với public repo + AI provider keys. OAuth chỉ cần khi bạn muốn analyze private repo.

### Scripts

```bash
bun run dev          # Start dev server (port 3000, hot reload)
bun run build        # Production build
bun run start        # Run production server
bun run lint         # ESLint check
bun run db:push      # Push Prisma schema to SQLite
bun run db:generate  # Regenerate Prisma client
bun run db:migrate   # Run migrations
bun run db:reset     # Reset database (⚠️ xóa hết data)
```

---

## 📁 Project Structure

```
CodeInsightAI/
├── prisma/
│   └── schema.prisma              # 8 models: Analysis, ChatMessage, FileSummary,
│                                  #   UserSettings, User, Account, Session, VerificationToken
├── public/
│   ├── logo.png                   # CodeInsight AI logo
│   └── logo.svg
├── locales/
│   ├── en/                        # 13 namespace JSON files
│   │   ├── common.json
│   │   ├── settings.json
│   │   ├── dashboard.json
│   │   ├── analysis.json
│   │   ├── landing.json
│   │   ├── reports.json
│   │   ├── errors.json
│   │   ├── providers.json
│   │   ├── personality.json
│   │   ├── developer.json
│   │   ├── history.json
│   │   ├── chat.json
│   │   └── notifications.json
│   └── vi/                        # Mirror của en/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analyze/           # POST: GitHub fetch + analyze (sync/async)
│   │   │   ├── chat/              # POST: AI chat với repo context
│   │   │   ├── history/           # GET/POST: list/get analyses
│   │   │   ├── jobs/[id]/         # GET: poll job status
│   │   │   ├── providers/test/    # POST: validate API key
│   │   │   ├── report/            # GET: full report by id
│   │   │   ├── reset/             # DELETE: delete account
│   │   │   ├── settings/          # GET/POST: user settings
│   │   │   ├── parse/             # POST: parse repo URL
│   │   │   ├── search/            # POST: semantic search
│   │   │   ├── health/            # GET: health check
│   │   │   └── auth/[...nextauth]/ # NextAuth.js
│   │   ├── globals.css            # Tailwind + glassmorphism + theme vars
│   │   ├── layout.tsx             # Root layout (SSR locale + theme)
│   │   └── page.tsx               # View orchestrator (Zustand state-based)
│   ├── components/
│   │   ├── 3d/
│   │   │   └── ai-core.tsx        # R3F Canvas — icosahedron + starfield + Bloom
│   │   ├── shared/
│   │   │   ├── app-shell.tsx      # Sidebar + topbar + mobile nav + footer
│   │   │   ├── animated-background.tsx
│   │   │   ├── command-palette.tsx # ⌘K
│   │   │   ├── dependency-graph.tsx # d3-force interactive graph
│   │   │   ├── code-viewer.tsx    # Syntax-highlighted snippets
│   │   │   ├── debug-panel.tsx    # Developer Mode UI
│   │   │   ├── language-switcher.tsx
│   │   │   ├── theme-switcher.tsx
│   │   │   ├── theme-manager.tsx  # Apply personalization to DOM
│   │   │   ├── ui.tsx             # GlassCard, ScoreGauge, GradientText, etc.
│   │   │   └── hydration-guard.tsx
│   │   ├── ui/                    # shadcn/ui components
│   │   └── views/
│   │       ├── landing-view.tsx   # Hero + features + pricing + FAQ
│   │       ├── dashboard-view.tsx # Health gauge + score cards + charts
│   │       ├── analyze-view.tsx   # 8-stage pipeline + completion screen
│   │       ├── project-view.tsx   # 9-tab report (Overview → Roadmap)
│   │       ├── chat-view.tsx      # AI chat + personality + debug panel
│   │       ├── history-view.tsx   # Past analyses
│   │       ├── providers-view.tsx # 14 AI providers + feature routing
│   │       ├── personalities-view.tsx # Personality CRUD
│   │       └── settings-view.tsx  # 7 tabs (Account → Alerts)
│   └── lib/
│       ├── types.ts               # Domain types (View, AIProvider, AnalysisReport...)
│       ├── repo-parser.ts         # Parse files → imports/exports/functions + dep graph
│       ├── analysis-engine-v2.ts  # Full analysis pipeline + dynamic SVG diagrams
│       ├── analysis-engine.ts     # v1 fallback (seeded mock for offline)
│       ├── prompt-engine.ts       # Build AI context, token-aware, semantic search
│       ├── analyzers/
│       │   ├── security.ts        # 13 rules
│       │   ├── bugs.ts            # 11 rules
│       │   ├── performance.ts     # 42 rules
│       │   └── architecture.ts    # Martin metrics + DFS cycles + layer violations
│       ├── providers.ts           # 14 provider presets
│       ├── providers-store.ts     # Zustand + persist
│       ├── personalities.ts       # 5 built-in personalities
│       ├── personality-store.ts   # CRUD + import/export
│       ├── personalization-store.ts # Theme/accent/density/animation
│       ├── developer-mode-store.ts # Debug toggles + logs + snapshots
│       ├── secret-mask.ts         # Redact API keys/tokens in debug output
│       ├── i18n.ts                # Cookie-based, SSR-safe
│       ├── job-queue.ts           # Background job progress tracking
│       ├── store.ts               # Zustand nav/analysis state
│       ├── auth.ts                # NextAuth config
│       └── db.ts                  # Prisma client
├── package.json
├── tsconfig.json
└── next.config.ts
```

---

## 🔍 Static Analyzers

### Security (13 rules)

| Rule | Severity | Mô tả |
|------|----------|-------|
| Hardcoded secrets | critical | `sk-*`, `ghp_*`, `AIza*`, `password=` trong source |
| SQL Injection | critical | String concat trong SQL query |
| XSS | high | `dangerouslySetInnerHTML`, unescaped HTML |
| Weak hashing | high | MD5, SHA1 cho password |
| Missing CSRF | medium | Form POST không có CSRF token |
| Insecure deserialization | high | `pickle.loads`, `yaml.load` không SafeLoader |
| Path traversal | high | User input vào `fs.readFile` không sanitize |
| Open redirect | medium | User input vào `res.redirect` |
| Debug mode in prod | high | `debug=True`, `NODE_ENV !== 'production'` |
| CORS wildcard | medium | `Access-Control-Allow-Origin: *` |
| Hardcoded credentials | critical | `password: "admin"` |
| Insecure random | medium | `Math.random()` cho crypto |
| Missing rate limit | low | API endpoint không có rate limit |

### Bugs (11 rules)

Race conditions, null derefs, off-by-one, unchecked promises, type coercion bugs, mutable default arguments, switch fallthrough, missing await, floating point comparison, integer overflow, division by zero.

### Performance (42 rules)

**Bundle (6)**: lodash full import, moment.js, underscore, rxjs wildcard, antd full import, barrel re-exports.

**Memory leaks (4)**: setInterval without clearInterval, addEventListener without removeEventListener, setTimeout in useEffect without cleanup, subscriptions without unsubscribe.

**React (10)**: missing useMemo, missing useCallback, useState object spread, inline style objects, missing React.memo, large component files, missing keys, many inline handlers, dangerouslySetInnerHTML, missing Suspense around React.lazy.

**Async/JS (5)**: sequential await in loop, async without await, console.log in prod, eval/new Function, setTimeout for animation.

**Next.js (3)**: missing dynamic import, `<img>` vs next/image, unnecessary "use client".

**Query/DB (2)**: N+1 query, unbounded findMany.

**Advanced (12)**: nested ternaries, object/array default props, large inline data, useEffect without deps array, many useState, props to memoized child not wrapped, JSON.parse in render, string concat in loop, layout thrashing, DOM query in render, sync file I/O in request handler, RegExp in render.

### Architecture (Robert C. Martin metrics)

| Metric | Công thức | Ý nghĩa |
|--------|-----------|---------|
| **Instability (I)** | `Ce / (Ca + Ce)` | 0=stable, 1=volatile. Ce = efferent coupling (deps ra ngoài), Ca = afferent (deps vào mình). |
| **Abstractness (A)** | `Na / Nc` | 0=concrete, 1=abstract. Na = số module chỉ có types/interfaces. |
| **Distance from Main Sequence (D)** | `\|A + I - 1\|` | 0=optimal, 1=worst. Đo độ "khỏe" của component. |
| **Fan-in / Fan-out** | count | Bao nhiêu module depend on me / I depend on. |
| **Coupling** | avg imports/file | Đo độ phụ thuộc trung bình. |
| **Cohesion** | intra-dir imports / total | Đo mức độ group-related trong cùng directory. |

Plus: layer violation detection (component importing DB directly), directory-level circular dep DFS, god module detection (>20 functions), linting config detection, CI/CD config detection.

---

## 🤖 AI Providers

14 providers được hỗ trợ, feature-based routing (mỗi feature có thể dùng model khác nhau):

| Provider | ID | Best for | Notes |
|----------|----|---------|-------|
| **OpenRouter** | `openrouter` | Multi-model | 1 key, 100+ models. Recommended. |
| **OpenAI** | `openai` | Chat, vision | GPT-4o, GPT-4o-mini, o1 |
| **Anthropic** | `anthropic` | Long context | Claude 3.5 Sonnet, Opus |
| **Google Gemini** | `gemini` | Vision, long ctx | Gemini 1.5 Pro, Flash |
| **DeepSeek** | `deepseek` | Code reasoning | Coder V2, V3 |
| **Groq** | `groq` | Fast inference | Llama 3.1, Mixtral |
| **Ollama** | `ollama` | Local, offline | Chạy local, free |
| **LM Studio** | `lmstudio` | Local, offline | Chạy local, free |
| **Azure OpenAI** | `azure` | Enterprise | Cần deployment name |
| **Together AI** | `together` | Open models | Llama, CodeLlama |
| **Fireworks AI** | `fireworks` | Fast inference | Llama 3, Mixtral |
| **Mistral** | `mistral` | EU compliance | Mistral Large, Codestral |
| **xAI** | `xai` | Reasoning | Grok-2 |
| **Custom** | `custom` | Any OpenAI-compatible | baseUrl + apiKey |

### Feature Routing

Mỗi feature có thể route đến model khác nhau:

| Feature | Default use case |
|---------|-----------------|
| `chat` | Conversation với codebase |
| `bugs` | Bug detection reasoning |
| `security` | Security audit |
| `performance` | Perf analysis |
| `architecture` | Arch pattern detection |
| `docs` | Generate README/API docs |
| `vision` | Image/diagram understanding |
| `refactor` | Refactor suggestions |
| `summary` | Repo summary |

---

## 🌐 i18n

- **English** 🇺🇸 + **Tiếng Việt** 🇻🇳
- **13 namespaces** × 2 ngôn ngữ = 26 locale files
- **SSR-safe**: cookie-based, không hydration mismatch
- **Browser auto-detection** lần đầu truy cập
- **LanguageSwitcher** ở topbar (instant switch, no reload)
- **AI respond** bằng ngôn ngữ đã chọn (injected vào system prompt)

---

## 🔐 Privacy

| Data | Lưu ở đâu | Gửi đi đâu |
|------|-----------|-----------|
| API keys | Browser `localStorage` | ❌ Không gửi đến CodeInsight server |
| Analyses | SQLite local (`db/custom.db`) | ❌ |
| Chat messages | SQLite local | ❌ |
| Repository code | In-memory cache (1hr TTL) | → GitHub API (để fetch) → AI provider (để analyze) |
| Settings | Browser `localStorage` | ❌ |

- **Không có server trung gian** — browser gọi thẳng đến AI provider.
- **Offline mode**: connect Ollama / LM Studio local, không cần internet.
- **Delete account**: Settings → Danger Zone → Delete account (xóa toàn bộ data).

---

## 🗺 Roadmap

### ✅ Đã hoàn thành (v3.4)

- [x] 8-stage analysis pipeline với real GitHub fetch
- [x] 4 static analyzers (66 rules tổng)
- [x] d3-force interactive dependency graph
- [x] Dynamic SVG diagrams (UML, Sequence, ERD)
- [x] 14 AI providers + feature routing
- [x] AI Personality System (5 built-in + custom CRUD)
- [x] Developer Mode + Debug Panel (secret masking)
- [x] Personalization (theme/accent/density/animation/accessibility)
- [x] i18n (en/vi) — SSR-safe
- [x] NextAuth GitHub OAuth (private repo support)

### 🚧 Đang phát triển

- [ ] Streaming chat responses (SSE)
- [ ] Real embeddings (local sentence-transformers)
- [ ] Vector search với cosine similarity
- [ ] Multi-repo comparison
- [ ] Diff analysis (compare 2 commits)
- [ ] Export report as PDF
- [ ] More analyzers (accessibility, SEO, mobile)

### 💡 Ideas

- VS Code extension
- GitHub Action integration
- Team shared analyses
- Custom analyzer plugins

---

## 🤝 Contributing

Contributions are welcome! 

1. Fork repo
2. Tạo branch: `git checkout -b feature/amazing-feature`
3. Commit: `git commit -m 'Add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Open Pull Request

### Development guidelines

- **TypeScript strict** — không `any` trừ khi thực sự cần
- **ESLint** phải pass: `bun run lint`
- **shadcn/ui** components preferred over custom implementations
- **i18n**: mọi UI string mới phải thêm vào cả `locales/en/` và `locales/vi/`
- **Secret masking**: không bao giờ log API keys raw — dùng `maskSecrets()` từ `src/lib/secret-mask.ts`

---

## 📄 License

**MIT** © [vanhoi04082006-pixel](https://github.com/vanhoi04082006-pixel)

Xem file [LICENSE](LICENSE) để biết chi tiết.

---

<div align="center">

**Built with ❤️ for developers who want to understand code, not just write it.**

⭐ Star repo nếu thấy hữu ích!

[Report bug](https://github.com/vanhoi04082006-pixel/CodeInsightAI/issues) · [Request feature](https://github.com/vanhoi04082006-pixel/CodeInsightAI/issues) · [Discussions](https://github.com/vanhoi04082006-pixel/CodeInsightAI/discussions)

</div>
