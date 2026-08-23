# CodeXishForge security review

The CodeXishForge 0.9 review covers the desktop boundaries most likely to receive untrusted input.

| Boundary | Enforced policy |
| --- | --- |
| IPC | Every handler validates the exact trusted renderer document and owning window; the companion has a two-channel allowlist |
| Navigation | Packaged renderer documents are the only internal destinations; new windows are denied |
| External links | Credential-free HTTPS only, with bounded input and no control characters |
| Attachments | Absolute regular files only; symlinks are rejected and size is capped at 100 MB |
| Updates | Stable/beta version validation, bounded file metadata, HTTPS or plain relative artifact names, SHA-512 metadata, no downgrade, no automatic download/install |
| Diagnostics | Structured recursive redaction covers authorization, tokens, passwords, cookies, secrets, private keys, and OAuth query values |
| Release reports | Disabled by default, HTTPS endpoint only, two fixed report kinds, and a field allowlist |

The renderer uses context isolation, sandboxing, disabled Node integration, and a restrictive content security policy. The preload bridge exposes named operations rather than Electron primitives. Shell commands are not constructed from renderer strings; Git and Codex processes receive validated argument arrays.

This review does not replace operating-system sandboxing or the Codex CLI policy engine. Repository access, commands, tools, managed settings, hooks, approvals, and subagent permissions continue to be enforced by the installed CLI and the user's selected sandbox.

Security-sensitive mutations retain explicit confirmation boundaries. Update publication, signing, and Snap Store review remain release operations outside the application runtime.
