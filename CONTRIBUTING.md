# Contributing to CodeInsight AI

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
git clone https://github.com/vanhoi04082006-pixel/CodeInsightAI.git
cd CodeInsightAI
bun install
cp .env.example .env
# Edit .env with your values
bun run db:push
bun run dev
```

## Code Standards

- **Language**: TypeScript 5 (strict mode)
- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS 4 + shadcn/ui (New York style)
- **i18n**: All user-visible strings must use `t("namespace", "key")` — no hardcoded strings
- **Technical terms**: Keep untranslated (GitHub, API, AST, BYOK, Platform AI, CodeGraph)

### Linting

```bash
bun run lint     # ESLint
npx tsc --noEmit # TypeScript check
```

Both must pass before submitting a PR.

## Architecture Guidelines

### Adding a new AI pass
1. Add case in `src/lib/analysis-manifest.ts` (`ANALYSIS_PASSES` — single source of truth)
2. Add to `PassType` type in `src/lib/analysis-manifest.ts`
3. Add case in `src/lib/ai-deep-analysis-helpers.ts` (`buildPromptForPass`)
4. Add to `updateReportWithPassResult` in `api/analyze/ai-pass/route.ts`
5. Add i18n key for pass name

### Adding a new Graph provider
1. Create `src/lib/graph/providers/my-provider.ts`
2. Implement `GraphProvider` interface (`load(analysisId, report)`)
3. Register in `providers/index.ts`
4. Add to `ALL_GRAPH_TYPES` in `types.ts`

### Adding a new Diagram provider
1. Create `src/lib/diagram/providers/my-diagram.ts`
2. Implement `DiagramProvider` interface (`generate(graphData, report)`)
3. Register in `providers/index.ts`
4. Add to `ALL_DIAGRAM_TYPES` in `types.ts`

### Adding a new Diagram layout
```typescript
import { registerLayout } from "@/lib/diagram/diagram-layout";
registerLayout("my-layout", (diagram) => {
  // Compute positions
  return { layout: Map<...>, width, height };
});
```

### i18n rules
- Add keys to BOTH `locales/en/` and `locales/vi/` (parity required)
- Use dot-path keys (e.g. `admin.platformAi.toast.saved`)
- Keep technical terms untranslated in Vietnamese
- Run parity check: all keys in EN must exist in VI

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit with clear message (`feat: add X`, `fix: Y`, `refactor: Z`)
4. Ensure `bun run lint` + `npx tsc --noEmit` pass
5. Submit PR with description of changes

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
