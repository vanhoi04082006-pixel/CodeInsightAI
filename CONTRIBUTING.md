# Contributing to CodeInsight AI

Thank you for your interest in contributing! This document outlines the process.

## Development Setup

```bash
# Clone
git clone https://github.com/vanhoi04082006-pixel/CodeInsightAI.git
cd CodeInsightAI

# Install
bun install

# Set up local DB
cp .env.example .env
# Edit .env: DATABASE_URL=file:./db/custom.db
bun run db:push

# Start dev server
bun run dev
```

## Development Workflow

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feature/your-feature`
3. **Code** — follow existing conventions
4. **Test**: `bun run lint && bun run test`
5. **Commit**: Use [conventional commits](https://www.conventionalcommits.org/)
   - `feat:` new feature
   - `fix:` bug fix
   - `refactor:` code restructuring
   - `docs:` documentation
   - `perf:` performance
6. **Push** and create a **Pull Request**

## Code Style

- **TypeScript** strict mode (no `any` unless necessary)
- **ESLint** must pass: `bun run lint`
- **Prettier** (coming soon)
- Use **shadcn/ui** components when possible
- Use **Lucide** icons
- Use **Framer Motion** for animations
- Follow existing **Glassmorphism + Cyber** design system

## Commit Message Format

```
type(scope): description

[optional body]

Co-authored-by: ...
```

Examples:
```
feat(analyze): add hybrid sync+async AI analysis
fix(cursor): z-index above toast notifications
refactor(admin): split admin-view into 3 files
docs(readme): update provider count to 15
```

## Pull Request Process

1. Ensure lint + tests pass
2. Update documentation if needed
3. Request review
4. Squash commits before merge

## Reporting Issues

- Use GitHub Issues
- Include: OS, browser, steps to reproduce, expected vs actual
- For security issues: see [SECURITY.md](.github/SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
