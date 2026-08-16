# Contributing

Thanks for helping improve the unofficial Linux desktop client. Contributions should preserve its repository-first scope, local-data boundary, explicit approval model, and graceful behavior when an optional Codex capability is unavailable.

## Before opening an issue

- Use a supported release or the current `main` branch.
- Search existing issues and the [support policy](docs/SUPPORT.md).
- Keep credentials, prompts, responses, account identifiers, private repository content, and complete local paths out of issues and attachments.
- Do not disclose a suspected vulnerability in a public issue. Follow the private reporting route described by the repository's Security tab once private vulnerability reporting is enabled.

## Development setup

Use Node.js 22.12 or newer and the current Codex CLI.

```bash
npm ci
npm run check
```

`npm run check` rebuilds the renderer, checks JavaScript syntax, and runs the complete unit suite. Package or desktop changes should also run the relevant commands documented in [README.md](README.md#verify-and-package). Do not commit generated `dist/` artifacts.

## Pull requests

Keep each pull request focused and explain:

1. the user-visible problem and intended behavior;
2. the security, privacy, compatibility, and accessibility boundaries affected;
3. automated tests added or changed; and
4. manual Linux desktop/session evidence, when applicable.

Never weaken sandboxing, confirmation boundaries, URL/path validation, credential ownership, update verification, or diagnostic redaction to make a test pass. A feature that depends on an experimental Codex method must remain capability-gated.

Release claims need evidence for the exact package digest. Historical screenshots or results from a different build are useful regression context but cannot complete a [release checklist](docs/RELEASE-CHECKLIST.md) item.
