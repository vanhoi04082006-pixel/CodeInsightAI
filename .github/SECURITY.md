# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in CodeInsight AI, please report it responsibly.

**DO NOT open a public GitHub issue.**

Instead, please email: **vanhoi04082006@gmail.com** with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You should receive a response within 48 hours. If the vulnerability is confirmed:
- We will acknowledge receipt within 48 hours
- We will provide a fix timeline within 7 days
- We will credit you in the release notes (unless you prefer to remain anonymous)

## Security Measures

### Authentication
- GitHub-only OAuth (NextAuth.js v4, JWT strategy)
- Session-based authorization on all API routes
- Admin role detection via DB + ADMIN_EMAIL env var

### Data Protection
- API keys encrypted with AES-256-GCM before DB storage
- API keys stripped from localStorage in production
- No raw API keys ever sent to client
- Secrets masked in debug output

### API Security
- Rate limiting on all API routes (60/min general, 20/min analyze/chat)
- CSP headers (7 security headers)
- HSTS with preload
- Frame-ancestors: none (clickjacking protection)
- Multi-tenant data isolation (userId scoping)

### Infrastructure
- Environment variables for all secrets (never committed)
- Vercel serverless deployment
- Neon PostgreSQL with SSL
- No plaintext secrets in codebase

## Scope

The following are **in scope**:
- Server-side code (API routes, lib functions)
- Authentication/authorization bypass
- SQL injection / Prisma query injection
- XSS via user input
- CSRF
- SSRF
- Path traversal
- Insecure direct object references

The following are **out of scope**:
- Client-side CSS/HTML injection with no impact
- Self-XSS
- Missing best-practice headers (report via issue, not email)
- Rate limit bypass (report via issue)
- Third-party service vulnerabilities (report to the service)

## Disclosure Timeline

1. **Day 0**: Vulnerability reported via email
2. **Day 1-2**: Acknowledgment + triage
3. **Day 3-7**: Fix developed + tested
4. **Day 8-14**: Fix deployed to production
5. **Day 15**: Public disclosure (with reporter's consent)
