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

## 0.2.1 — Stabilization

- [x] Rotating structured logs with credential and OAuth redaction
- [x] In-app diagnostics, clipboard copy, and JSON export
- [x] Capability-based app-server compatibility reporting
- [x] Last-thread restoration and terminal disconnect recovery
- [x] Unclean-shutdown marker and renderer crash restart flow
- [x] Modern `snapcraft.core22` package configuration
- [x] Regression coverage for protocol errors and log redaction/rotation

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

## 0.5 — Release confidence and extension control

- [x] Continuous integration for renderer builds, syntax checks, and the complete test suite
- [x] Reproducible AppImage, Debian, and Snap release gates with metadata and update-hash inspection
- [x] Packaged launch smoke tests with a clean home directory and minimal desktop `PATH`
- [x] Deterministic login/logout and approval-flow fixtures
- [x] In-app discovery and management for installed skills, plugins, and MCP servers
- [x] Configuration health checks with safe links to the owning Codex configuration

## 0.6 — Tasks, agents, and worktrees

- [x] Background task queue with clear queued, running, waiting, failed, and completed states
- [x] One-click isolated Git worktrees for concurrent tasks
- [x] Multi-agent activity view with ownership, handoffs, approvals, and resource limits
- [x] Durable task recovery across application and CLI restarts
- [x] Unified inbox for approvals, questions, completed work, and failed background processes

## 0.7 — Review and collaboration

- [x] Commit, branch, push, and draft pull-request workflows with explicit confirmation boundaries
- [x] GitHub issue, pull-request, review-comment, and Actions status context
- [x] Review mode for agent changes with per-hunk decisions and test evidence
- [x] Shareable, redacted diagnostics and task summaries
- [x] Repository policy visibility for managed settings, hooks, permissions, and contribution guidance

## 0.8 — Richer creation

- [x] Voice dictation, with realtime voice conversations where the public Codex interface supports them
- [x] Canvas-style long-form editing for plans, specifications, and documentation
- [x] Search across local threads, task outcomes, files, and generated artifacts
- [x] Reusable task templates for common repository workflows

## 0.9 — Stabilization

- [x] Tested Codex CLI compatibility matrix and graceful protocol migrations
- [x] Settings and local-state migrations with rollback-safe recovery
- [x] Performance budgets for startup, large threads, diffs, and terminal output
- [x] Security review of IPC, external links, package updates, attachments, and diagnostic redaction
- [x] Accessibility conformance pass, screen-reader mode, and a reproducible assistive-technology test matrix
- [x] Release reporting limited to explicit opt-in crash and compatibility reports

## 1.0 — Trusted Linux daily driver

Version 1.0 means the local-first coding workflow is dependable enough to recommend as a primary Codex desktop client, not that every general assistant feature exists.

- Stable persistent threads, background tasks, isolated worktrees, terminals, approvals, and change review
- Complete local Git workflow plus optional GitHub collaboration from issue through reviewed pull request
- Visible, manageable Codex extensions: skills, plugins, MCP servers, configuration, policies, and hooks
- Files, images, screenshots, camera, voice, and long-form artifacts in one accessible workspace
- Signed, updateable AppImage and Debian releases plus a reviewed classic Snap
- Documented compatibility support, migrations, recovery, security boundaries, and release cadence
- Keyboard-complete, screen-reader-tested GNOME and KDE experiences on X11 and Wayland

Cloud-hosted execution, cross-device thread sync, and broad general-chat features remain post-1.0 unless supported by stable public Codex interfaces. The product stays repository-first.

## Release gates

Every package must pass protocol tests, a packaged launch test with a minimal desktop `PATH`, an AppImage-to-Debian upgrade and recovery test from real 0.8 state fixtures, login/logout verification, approval-flow fixtures, artifact metadata inspection, and the automated accessibility conformance pass. A real-account login/logout pass and the applicable GNOME/KDE assistive-technology rows remain manual release checks because CI must never receive maintainer credentials or pretend to evaluate spoken output. Snap Store publication requires approval for classic confinement.
