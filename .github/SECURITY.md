# Security Policy

## Supported Versions

| Version | Supported |
|---------|:---------:|
| 0.3.x   | ✅        |
| < 0.3   | ❌        |

## Security Features

CodeInsight AI includes enterprise-grade security features:

- **Secret Redaction** — 17 patterns strip secrets before sending to any AI provider
- **Multi-tenant Isolation** — Ownership checks on all API endpoints
- **Token Budget Enforcement** — Hard block when monthly limit exceeded
- **Rate Limiting** — DB-backed, per-user, per-endpoint
- **Policy Engine** — 8 configurable policies (max-files, block-provider, etc.)
- **Audit Log** — Every AI call logged with provider, tokens, latency, status
- **Model Fallback** — Auto-switch providers on failure
- **AES-256-GCM Encryption** — API keys encrypted server-side

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**DO NOT open a public GitHub issue.**

Email: **vanhoi04082006@gmail.com** with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a fix timeline.
