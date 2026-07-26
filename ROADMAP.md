# Product roadmap

Codex Linux Community is a repository-first desktop coding agent. Desktop conveniences should reduce friction around that workflow rather than turn the product into a general ChatGPT clone.

## 0.2 — Daily-driver foundations

- [x] Rich Markdown conversation rendering, syntax highlighting, tables, links, and copy controls
- [x] File and image attachments, drag and drop, clipboard images, and screenshot capture
- [x] Git status, branch context, and staged/unstaged/current-turn review
- [x] Persistent interactive terminal sessions with input, termination, and output streaming
- [x] Command, file, permissions, MCP elicitation, and user-question approval interfaces
- [x] Global shortcut and compact quick-prompt companion window
- [x] CLI discovery, ChatGPT sign-in, diagnostics, and recovery
- [x] AppImage, Debian, and classic-confinement Snap packages
- [x] Per-file diff navigation, safe discard, staging/unstaging, and commit creation
- [x] Terminal tab management and background-process visibility
- [x] Automatic Codex protocol compatibility checks

## 0.3 — Git workflows

- [x] Structured per-file status and diff navigation
- [x] Stage and unstage individual files, including rename path pairs
- [x] Discard unstaged tracked changes while preserving staged content
- [x] Permanently remove untracked files only after explicit confirmation
- [x] Create commits from staged changes with explicit confirmation
- [x] Git operations use literal pathspecs, no shell, and validated repository-relative paths

## 0.4 — Linux desktop integration

- [x] Configurable global shortcut and tray behavior across GNOME, KDE, and common Wayland compositors
- [x] Screenshot selection for display, window, and region
- [x] Camera capture and attachment preview
- [x] Configurable notifications for completed turns, approvals, questions, and background terminals
- [x] XDG launch-at-login with background tray startup
- [x] Single-instance `codex-linux://` protocol and deep-link routing
- [x] Stable/beta updater channels with explicit download and install controls
- [x] Accessibility audit, keyboard navigation, reduced motion, text scaling, and high-contrast support

## Later — Broader assistant capabilities

- Voice input and realtime voice conversations
- Canvas-style long-form editing
- General knowledge-work modes where they complement development
- Cross-device or hosted thread experiences when supported by public Codex interfaces

## Release gates

Every package must pass protocol tests, a packaged launch test with a minimal desktop `PATH`, login/logout verification, approval-flow fixtures, and artifact metadata inspection. Snap Store publication requires approval for classic confinement.

## 0.2.1 — Stabilization

- [x] Rotating structured logs with credential and OAuth redaction
- [x] In-app diagnostics, clipboard copy, and JSON export
- [x] Capability-based app-server compatibility reporting
- [x] Last-thread restoration and terminal disconnect recovery
- [x] Unclean-shutdown marker and renderer crash restart flow
- [x] Modern `snapcraft.core22` package configuration
- [x] Regression coverage for protocol errors and log redaction/rotation
