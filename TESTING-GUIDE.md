# 🧪 Hướng dẫn Kiểm thử CodeInsight AI

> Bản hướng dẫn kiểm thử thực tế để verify toàn bộ tính năng Phase 1-3, phát hiện bug/lỗi.

## 📋 Chuẩn bị

### Môi trường
- Dev server: `http://localhost:3000` (đã chạy)
- Tài khoản GitHub (để Sign in)
- 2 repo test:
  - Repo NHỎ sạch: `https://github.com/vercel/next.js` (hoặc repo của bạn)
  - Repo CÓ issue: `https://github.com/facebook/react` (lớn, có nhiều patterns)

### Truy cập
- Mở **Preview Panel** bên phải, hoặc click **"Open in New Tab"**
- Đảm bảo đăng nhập GitHub (nút "Sign in" góc trên phải)

---

## PHẦN A: KIỂM THỬ UI CƠ BẢN

### A1. Landing Page
**Bước kiểm thử:**
1. Mở `http://localhost:3000/`
2. Kiểm tra hiển thị

**Kỳ vọng:**
- ✅ Hero: "Paste a GitHub Repo. AI Understands Everything."
- ✅ Nút "Analyze Repo" + input URL
- ✅ 4 trust badges: "Free with your own keys", "Platform AI from $9/mo", "GitHub login", "14 AI providers"
- ✅ Pricing section: 3 plans (Free $0, Pro $9, Team $29)
- ✅ Footer: sticky ở bottom, không overlay content

**Lỗi cần tìm:**
- ❌ Trang trắng / hydration error
- ❌ Footer nổi giữa trang (không sticky bottom)
- ❌ Button không click được

### A2. Language Toggle (i18n)
**Bước kiểm thử:**
1. Click nút 🇺🇸 English (góc trên phải)
2. Chọn 🇻🇳 Tiếng Việt
3. Quan sát toàn bộ trang chuyển sang VI
4. Chuyển lại EN

**Kỳ vọng:**
- ✅ Toàn bộ UI dịch sang tiếng Việt (hero, features, pricing, footer)
- ✅ Thuật ngữ kỹ thuật GIỮ NGUYÊN: GitHub, Platform AI, CodeGraph, API, AST, BYOK
- ✅ Không có key text hiện ra (vd: `landing.heroTitle` thay vì nội dung)
- ✅ Reload trang → giữ nguyên ngôn ngữ đã chọn

**Lỗi cần tìm:**
- ❌ Một phần UI vẫn tiếng Anh khi chọn VI (hoặc ngược lại)
- ❌ Key text hiện ra thay vì nội dung dịch
- ❌ Hydration mismatch (console error)

### A3. Theme Toggle
**Bước kiểm thử:**
1. Click nút Theme (góc trên phải)
2. Chọn: Light → Dark → System
3. Quan sát giao diện

**Kỳ vọng:**
- ✅ Chuyển đổi mượt giữa light/dark
- ✅ Không flash trắng khi reload
- ✅ Lưu lựa chọn sau reload

### A4. Command Palette (⌘K)
**Bước kiểm thử:**
1. Nhấn `Cmd+K` (Mac) hoặc `Ctrl+K` (Windows)
2. Gõ "dashboard", "settings", "providers"

**Kỳ vọng:**
- ✅ Palette mở với search input
- ✅ Filter commands theo text gõ
- ✅ **Nếu Default mode (không BYOK)**: KHÔNG hiện "AI Providers" (locked)
- ✅ **Nếu Free user ở production**: KHÔNG hiện "Mission Control" (locked)
- ✅ Esc để đóng

**Lỗi cần tìm:**
- ❌ Hiện "AI Providers" khi đang ở Default mode (lock bypass)
- ❌ Palette không đóng sau click

---

## PHẦN B: KIỂM THỬ ANALYSIS (Static)

### B1. Phân tích repo (AI OFF)
**Bước kiểm thử:**
1. Sign in với GitHub
2. Vào tab "Analyze"
3. **TẮT** toggle "AI Analysis" (chỉ static)
4. Dán URL: `https://github.com/vercel/next.js`
5. Click "Analyze"
6. Đợi 15-30 giây

**Kỳ vọng:**
- ✅ Progress bar chạy qua 8 stages (Clone → Scan → AST → Deps → Embed → Static → AI → Report)
- ✅ Hoàn thành, chuyển sang Project Report
- ✅ Toast "Analysis complete — {score}/100"
- ✅ KHÔNG có chữ "AI" trong labels (honest naming: "Summary" thay vì "AI Summary")

**Lỗi cần tìm:**
- ❌ Stuck ở 0% hoặc 50%
- ❌ "Job not found" error
- ❌ Timeout sau 60s

### B2. Project Report — 10 tabs (Static mode)
**Bước kiểm thử:**
Click qua từng tab:

| Tab | Kỳ vọng | Lỗi cần tìm |
|-----|---------|-------------|
| **Overview** | Score gauge, 5 score bars, summary text, stats (files, lines, languages) | ❌ Summary tiếng Việt khi UI tiếng Anh |
| **Architecture** | Pattern (vd: "Next.js App Router"), layers, strengths, weaknesses | ❌ Trống hoàn toàn |
| **Bugs** | Danh sách issues với severity badges, click expand | ❌ "0 bugs" trên repo lớn |
| **Security** | Issues: hardcoded secrets, SQL injection, etc. | ❌ Issue titles tiếng Việt khi UI EN |
| **Performance** | Issues + positive findings ("✅ Uses useMemo") | ❌ Positive findings sai ngôn ngữ |
| **Dependencies** | Dependency tree, dead code, duplicates | ❌ Graph không render |
| **CodeGraph** | Visual graph (nodes + edges), zoom controls | ❌ Graph trống |
| **Code** | Code snippets (5 file phức tạp nhất), copy button | ❌ "AI explanation" label (nên là "Explanation") |
| **Docs** | README.md, API.md, Architecture.md tabs | ❌ Docs trống |
| **Roadmap** | Roadmap phases, monetization, tech debt | ❌ "Giai đoạn 1: Vá lổ hổng" khi UI EN |

### B3. i18n trong Analysis Content
**Bước kiểm thử:**
1. Phân tích 1 repo
2. Chuyển ngôn ngữ EN → VI → EN
3. Quan sát nội dung analysis

**Kỳ vọng:**
- ✅ Summary, roadmap, docs, issue titles dịch theo ngôn ngữ
- ✅ Thuật ngữ kỹ thuật giữ nguyên: file paths, function names, React/Next.js, SQL Injection
- ✅ Score labels dịch: "Security"→"Bảo mật", "Performance"→"Hiệu suất"

**Lỗi cần tìm:**
- ❌ Nội dung hardcode tiếng Việt khi chọn EN
- ❌ Issue titles luôn tiếng Anh dù chọn VI

---

## PHẦN C: KIỂM THỬ AI ANALYSIS (Phase 1)

### C1. Phân tích repo (AI ON)
**Bước kiểm thử:**
1. Vào tab "Analyze"
2. **BẬT** toggle "AI Analysis"
3. Đảm bảo có AI provider (Platform AI hoặc BYOK)
4. Dán URL repo, click "Analyze"
5. Đợi AI passes chạy (2-5 phút, 9 passes)

**Kỳ vọng:**
- ✅ Static analysis hoàn thành trước (15-30s)
- ✅ Toast "Static analysis complete — AI deep analysis running..."
- ✅ AI passes chạy tuần tự: overview → summary → priorities → security → architecture → quality → performance → bestPractices → duplicates
- ✅ Progress hiển thị "Pass 3/9: Security Review"
- ✅ Hoàn thành, badge "✨ AI-Enhanced" hiện

**Lỗi cần tìm:**
- ❌ AI stuck ở pass 1
- ❌ "Token budget exceeded" (nếu free user)
- ❌ "Rate limit exceeded" (nếu gọi quá nhanh)
- ❌ 402 credits error (provider hết credit)

### C2. AI Overview Card (Phase 1)
**Bước kiểm thử:**
1. Mở Project Report → tab Overview
2. Tìm "AI Overview" card (violet gradient)

**Kỳ vọng:**
- ✅ Card hiện với badge "✨ AI"
- ✅ **Top Risks** (max 3): title + severity badge + evidence chips (file:line)
- ✅ **Quick Wins** (max 3): title + effort + evidence chips
- ✅ **Fix First**: 1 mục (amber border)
- ✅ **Fastest Score Gain**: 1 mục (cyan border)
- ✅ **Health Assessment**: paragraph mô tả

**Lỗi cần tìm:**
- ❌ Hơn 3 risks/wins (slice không hoạt động)
- ❌ Evidence chips trống
- ❌ Card không hiện (AI chưa chạy xong)

### C3. Evidence + Confidence (Phase 1)
**Bước kiểm thử:**
1. Tab Security (hoặc Bugs/Performance)
2. Tìm "AI Deep Review" card (violet border, đầu tab)
3. Mở rộng 1 issue

**Kỳ vọng:**
- ✅ Mỗi AI finding có:
  - **Evidence chips**: `<code>` tags với `file:line` (vd: `src/auth.ts:42`)
  - **Confidence badge**: "85% confidence" (xanh ≥80%, vàng ≥50%, đỏ <50%)
  - **Fix Plan**: ordered list các bước fix
  - **Severity badge**: AI-assigned (có thể khác static)

**Lỗi cần tìm:**
- ❌ Evidence trống (AI không trả file:line)
- ❌ Confidence luôn 1.0 hoặc thiếu
- ❌ Fix Plan không render

### C4. Action Buttons (Phase 1)
**Bước kiểm thử:**
1. Tab Bugs (hoặc Security/Performance)
2. Click expand 1 issue
3. Tìm 3 buttons: "Fix Now", "Generate Test", "Refactor"

**Kỳ vọng:**
- ✅ Click "Fix Now" → **AlertDialog hiện**:
  - Title: "Run AI Agent?"
  - Description: "This will start the Bug-Fixer agent..."
  - Target issue: title + file:line
  - Buttons: "Cancel" + "Run Agent"
- ✅ Click "Run Agent" → toast "Agent started — check Mission Control"
- ✅ Button disabled + spinner khi loading

**Lỗi cần tìm:**
- ❌ Click chạy ngay không confirm (P1 bug)
- ❌ Toast error
- ❌ Button không disabled khi loading

### C5. Code Tab AI (Phase 1)
**Bước kiểm thử:**
1. Tab Code
2. Chọn 1 file snippet
3. Click "Ask AI about this file" (violet button)

**Kỳ vọng:**
- ✅ Loading spinner
- ✅ AI Explanation card hiện bên dưới
- ✅ Nội dung: file làm gì, rủi ro, pattern, refactor suggestion
- ✅ Ngôn ngữ đúng setting (EN/VI)

**Lỗi cần tìm:**
- ❌ "AI explanation unavailable"
- ❌ Response sai ngôn ngữ
- ❌ Button không click được

---

## PHẦN D: KIỂM THỮ PHASE 2 (Decision Intelligence)

### D1. Timeline Tab
**Bước kiểm thử:**
1. Phân tích CÙNG repo 2 LẦN (để có history)
2. Mở tab "Timeline"

**Kỳ vọng:**
- ✅ Score trajectory bar chart (≥2 cột)
- ✅ 2 dropdowns: "from" → "to"
- ✅ Chọn 2 analysis → diff view hiện:
  - Score deltas (6 metrics, xanh nếu +, đỏ nếu -)
  - Summary: "Score +5 — 4 improvements, 2 regressions"
  - New Issues list (red)
  - Resolved Issues list (green, strikethrough)
  - Files Added/Deleted
  - Tech Debt Change

**Lỗi cần tìm:**
- ❌ "No previous analyses" (nếu chỉ scan 1 lần — expected)
- ❌ Diff trống dù có 2 scans
- ❌ Chart không render

### D2. Regression Banner (Phase 2)
**Bước kiểm thử:**
1. Mở tab Overview (sau khi đã scan 2 lần)

**Kỳ vọng:**
- ✅ "What changed since last scan" banner hiện (chỉ khi có previous analysis)
- ✅ Verdict badge: "Improved" (xanh) / "Regressed" (đỏ) / "Neutral" (cyan)
- ✅ Headline: "Score +5 — 3 improvements, 1 regression"
- ✅ 2 cột: Regressions (red) + Improvements (green)
- ✅ "View timeline →" button

**Lỗi cần tìm:**
- ❌ Banner hiện khi chỉ scan 1 lần (should be hidden)
- ❌ Verdict sai (vd: score tăng nhưng verdict="regressed")
- ❌ Banner trống

### D3. Enhanced Roadmap (Phase 2)
**Bước kiểm thử:**
1. Mở tab Roadmap (sau AI analysis)

**Kỳ vọng:**
- ✅ AI Priorities card: mỗi priority có:
  - **Effort badge**: "⏱️ 4h"
  - **Phase badge**: P0 (red) / P1 (amber) / P2 (cyan) / P3 (gray)
  - **ROI bar**: 0-100
  - **dependsOn chips**: "depends on: [issue title]"
- ✅ AI Roadmap: phases với `estimatedEffortHours` + `blockedBy`
- ✅ Executive Note card
- ✅ Sequencer warnings (nếu có cycle/violation)

**Lỗi cần tìm:**
- ❌ Effort/Phase trống (AI không trả)
- ❌ dependsOn references invalid titles
- ❌ Sequencer crash

### D4. Refactor Sequencing (Phase 2)
**Bước kiểm thử:**
1. Trong tab Roadmap, cuộn xuống tìm "Refactor Sequencing" card

**Kỳ vọng:**
- ✅ Card với badge "✨ Graph-validated"
- ✅ Total effort + parallel speedup factor (vd: "12h · 2.5x speedup")
- ✅ 4 phase columns (P0-P3):
  - Mỗi issue: title, file path, effort, confidence badge, 🔗 graph-dep count
  - "⚡ parallel" badge nếu `canParallelize=true`
- ✅ Warnings banner (nếu total >80h)

**Lỗi cần tìm:**
- ❌ "No AI priorities found" (chạy AI trước)
- ❌ Tất cả confidence = "low" (graph không có data)
- ❌ Card không render

---

## PHẦN E: KIỂM THỮ PHASE 3 (Enterprise)

### E1. Token Budget (Phase 3.1)
**Bước kiểm thử:**
1. Vào Settings → xem TokenUsageWidget
2. Quan sát usage thực tế

**Kỳ vọng:**
- ✅ Widget hiện: "Used: 50,000 / 1,000,000 tokens"
- ✅ Progress bar
- ✅ Reset date: "Resets on [date]"
- ✅ Số liệu REAL (không phải estimate)

**Test budget exceeded:**
- Nếu có admin access: set user plan="free", record 1M+ tokens via DB
- Gọi AI → kỳ vọng: 429 + "Token budget exceeded"

**Lỗi cần tìm:**
- ❌ Usage luôn 0 (không track)
- ❌ "budget exceeded" nhưng AI vẫn chạy

### E2. Rate Limiting (Phase 3.3)
**Bước kiểm thử:**
1. Sign in as Free user
2. Gọi `/api/analyze` 11 lần liên tiếp (Free limit: 10/hour)

**Kỳ vọng:**
- ✅ 10 request đầu: thành công
- ✅ Request 11: 429 + `Retry-After` header + `X-RateLimit-Remaining: 0`

**Lỗi cần tìm:**
- ❌ Không có rate limit (11th request thành công)
- ❌ Rate limit sai plan (Pro user bị block)

### E3. Policy Engine (Phase 3.5)
**Bước kiểm thử:**
1. Vào Admin → tab "Policies" (cần admin role)
2. Enable policy "Max Files" với maxFiles=5
3. Save
4. Thử phân tích repo >5 files

**Kỳ vọng:**
- ✅ Policy saved
- ✅ Phân tích bị block: "Policy violation: Repository has 199 files (max: 5)"
- ✅ 403 response

**Lỗi cần tìm:**
- ❌ Policy không enforce
- ❌ Admin UI không save được

### E4. PDF/JSON Export (Phase 3.6)
**Bước kiểm thử:**
1. Mở Project Report
2. Tìm nút "JSON" và "PDF" (gần nút Share/Export)

**Kỳ vọng:**
- ✅ Click "JSON" → download `{repoOwner}-{repoName}-analysis.json`
- ✅ Click "PDF" → loading spinner → download `.pdf` file
- ✅ PDF có: title, summary, scores table, issues tables, AI Overview (nếu có), Roadmap (nếu có)
- ✅ Page numbers footer

**Lỗi cần tìm:**
- ❌ PDF generation failed
- ❌ PDF trống/malformed
- ❌ JSON không download

### E5. Model Fallback (Phase 3.2)
**Bước kiểm thử:**
*(Cần admin access)*
1. Admin → Platform AI tab
2. Configure fallback chain: `[{"providerId":"openai","model":"gpt-4o-mini"},{"providerId":"anthropic","model":"claude-3-haiku"}]`
3. Save
4. Simulate primary failure (vd: set sai API key cho primary)
5. Chạy AI analysis

**Kỳ vọng:**
- ✅ Console log: "Primary failed, fallback succeeded"
- ✅ AI analysis hoàn thành (dù primary fail)
- ✅ Audit log có `attemptedProviders` array

**Lỗi cần tìm:**
- ❌ Fallback không trigger
- ❌ Cả 2 providers fail

### E6. Multi-tenant Security (Phase 3.7)
**Bước kiểm thử:**
*(Nên test bằng curl/script)*
1. Sign in as User A, create analysis → get `analysisIdA`
2. Sign in as User B
3. User B gọi: `POST /api/chat` với `body.analysisId = analysisIdA`

**Kỳ vọng:**
- ✅ 404 response (không 403 — không leak existence)
- ✅ User B không đọc được User A's report

**Lỗi cần tìm:**
- ❌ User B đọc được User A's data (security leak)

---

## PHẦN F: KIỂM THỮ CHAT + MISSION CONTROL

### F1. AI Chat
**Bước kiểm thử:**
1. Phân tích 1 repo
2. Vào tab "Chat"
3. Hỏi: "What are the main security issues?"

**Kỳ vọng:**
- ✅ AI trả lời context-aware (dựa trên repo analysis)
- ✅ Ngôn ngữ đúng setting
- ✅ Streaming response (text hiện dần)
- ✅ Request Log sidebar (nếu bật)

**Lỗi cần tìm:**
- ❌ "Empty response"
- ❌ AI trả sai ngôn ngữ
- ❌ Chat stuck

### F2. Mission Control
**Bước kiểm thử:**
1. Cần Pro plan hoặc admin
2. Vào tab "Mission Control"
3. Mô tả goal: "Fix the top 3 security issues"
4. Start mission

**Kỳ vọng:**
- ✅ Agents chạy: Executive → Security → Bug-Fixer → Test → PR
- ✅ Activity feed real-time
- ✅ Network graph hiển thị agent collaboration
- ✅ File diff viewer khi code thay đổi

**Lỗi cần tìm:**
- ❌ "Mission Control locked" (nếu Free user — expected)
- ❌ Agents stuck

---

## PHẦN G: KIỂM THỮ CONSOLE ERRORS

### G1. Browser Console
**Bước kiểm thử:**
1. Mở DevTools (F12) → Console tab
2. Click qua tất cả tabs
3. Thực hiện các action ở trên

**Kỳ vọng:**
- ✅ KHÔNG có red errors
- ✅ KHÔNG có hydration mismatch warnings
- ✅ Chỉ có info logs (HMR, React DevTools)

**Lỗi cần tìm:**
- ❌ `TypeError: undefined is not an object`
- ❌ `Hydration failed`
- ❌ `Uncaught Error` ở bất kỳ tab nào

### G2. Network Tab
**Bước kiểm thử:**
1. DevTools → Network tab
2. Chạy analysis
3. Check API calls

**Kỳ vọng:**
- ✅ `/api/analyze` → 200
- ✅ `/api/analyze/ai-pass` → 200 (9 lần)
- ✅ `/api/usage/tokens` → 200
- ✅ Không có 500 errors
- ✅ Rate limit headers: `X-RateLimit-Remaining`

---

## PHẦN H: CHECKLIST TỔNG HỢP

Đánh dấu ✅ hoặc ❌ sau khi test:

### UI Cơ bản
- [ ] Landing render đúng
- [ ] Language toggle VI/EN hoạt động
- [ ] Theme toggle hoạt động
- [ ] Command palette (⌘K) respect locks
- [ ] Footer sticky bottom

### Static Analysis
- [ ] Analysis hoàn thành (AI off)
- [ ] 10 tabs render nội dung
- [ ] Honest naming (không "AI" ở static)
- [ ] i18n nội dung theo language

### AI Analysis (Phase 1)
- [ ] 9 AI passes chạy xong
- [ ] AI Overview card (top risks, quick wins, fix first)
- [ ] Evidence chips (file:line)
- [ ] Confidence badge đúng màu
- [ ] Action buttons + confirm dialog
- [ ] Code tab "Ask AI" hoạt động
- [ ] AI trả đúng ngôn ngữ

### Decision Intelligence (Phase 2)
- [ ] Timeline tab + score chart
- [ ] Diff 2 analyses hoạt động
- [ ] Regression banner (verdict + headline)
- [ ] Enhanced roadmap (effort + phase + ROI)
- [ ] Refactor sequencing card (graph-validated)

### Enterprise (Phase 3)
- [ ] Token budget widget hiện real data
- [ ] Rate limit block khi exceed
- [ ] Policy engine enforce
- [ ] PDF export hoạt động
- [ ] JSON export hoạt động
- [ ] Multi-tenant isolation (không leak)

### Chat + Mission
- [ ] AI chat context-aware
- [ ] Chat đúng ngôn ngữ
- [ ] Mission Control (nếu Pro)

### Console
- [ ] Không red errors
- [ ] Không hydration warnings
- [ ] Không 500 API errors

---

## 🚨 LỖI THƯỜNG GẶP + CÁCH FIX

| Lỗi | Nguyên nhân | Fix |
|-----|-------------|-----|
| "Token budget exceeded" | Free user dùng hết 1M tokens | Upgrade Pro hoặc chờ reset monthly |
| "Rate limit exceeded" | Gọi API quá nhanh | Chờ 1 giờ hoặc upgrade plan |
| "Job not found" | Serverless cold start | Re-analyze |
| AI stuck ở pass 1 | Provider timeout/error | Check provider credits, try fallback |
| Hydration mismatch | i18n cookie vs store | Reload trang |
| "Policy violation" | Admin enable policy | Disable policy trong Admin |
| PDF failed | jspdf load error | Check network, retry |
| Graph trống | Repo quá nhỏ hoặc parse fail | Try repo lớn hơn |

---

## 📞 BÁO CÁO LỖI

Khi phát hiện bug, ghi lại:
1. **Tab/feature**: vd "Overview tab"
2. **Bước thực hiện**: vd "Chuyển ngôn ngữ EN→VI"
3. **Kỳ vọng**: vd "Summary dịch sang tiếng Anh"
4. **Thực tế**: vd "Summary vẫn tiếng Việt"
5. **Console errors**: screenshot DevTools
6. **Network**: screenshot failing request

Gửi cho tôi để fix!
