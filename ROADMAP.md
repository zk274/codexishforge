# Product roadmap

CodeXishForge is a local-first Linux coding-agent workspace. Desktop conveniences should reduce friction around repository work rather than turn the product into a general chat client. It works with the user's installed OpenAI Codex CLI and remains independent community software.

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
- [x] Single-instance `codexishforge://` protocol and deep-link routing
- [x] Stable/beta updater channels with explicit download and install controls
- [x] Accessibility audit, keyboard navigation, reduced motion, text scaling, and high-contrast support

## 0.5 — Release confidence and extension control

- [x] Continuous integration for renderer builds, syntax checks, and the complete test suite
- [x] Repeatable AppImage, Debian, and Snap release gates with metadata and update-hash inspection
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
- [x] Accessibility conformance pass, screen-reader mode, and a repeatable assistive-technology test matrix
- [x] Release reporting limited to explicit opt-in crash and compatibility reports
- [x] Repeatable AppImage and Debian probes across available Wayland, X11/XWayland, and headless Xvfb backends

## 1.0 — Trusted Linux daily driver

Version 1.0 means the local-first coding workflow is dependable enough to recommend as a primary Linux workspace for work performed through an installed Codex CLI, not that every general assistant feature exists.

- [ ] On one exact 1.0 release candidate with a real Codex account, resume the last thread after restart; recover a background task and isolated worktree; restart a terminal after a CLI disconnect; approve and deny requests; and review, stage, reject, and commit changes without lost state.
- [ ] Pass the local Git status, diff, stage, unstage, discard, hunk review, commit, branch, and non-force-push suite. With authenticated GitHub CLI, list issues as context, create a draft pull request, and display its reviews, inline comments, checks, Actions runs, and branch policy.
- [ ] Inventory and toggle supported installed skills, plugins, and configured MCP servers; show their owning configuration layers and health; and display policies and hooks as read-only metadata without exposing secret configuration values.
- [ ] Exercise picker, drag/drop, clipboard, screen/window/region capture, camera stills, capability-gated voice, and persistent Markdown artifacts from the keyboard-accessible workspace; unsupported voice must degrade visibly without disabling the rest of Studio.
- [ ] Publish a fully verified release candidate as a GitHub prerelease, complete a live beta-channel update for installed AppImage and Debian builds, verify the documented GitHub/Sigstore artifact attestations, and bind the tested Snap digest to its Snap Store revision and assertion after classic-confinement approval.
- [ ] From a public tagged workflow, produce and verify `SHA256SUMS`, the release manifest, CycloneDX 1.6 SBOM, provenance bundle, and SBOM attestation bound to the tag commit and exact AppImage, Debian, and Snap digests.
- [ ] Publish the tested Codex CLI compatibility target plus migration, backup, recovery, security, stable/beta cadence, and supported-release policy.
- [ ] Complete all GNOME/KDE × Wayland/X11 package rows for AppImage, Debian, and classic Snap, including keyboard-only navigation and visual modes on every package, plus one assigned Orca reference package per desktop/session for the spoken-output sweep.
- [ ] Build final `1.0.0` as a new exact artifact set, repeat every prepublication gate against those new digests, publish those unchanged bytes deliberately, then perform the immediate stable-channel update and rollback/recovery smoke check.

Implementation of the underlying features is substantially complete. Promotion depends on evidence for each exact artifact set; historical 0.9 and RC results are regression evidence, not a substitute for the separate final build. The authoritative status and evidence fields are in the [1.0 exact-artifact release checklist](docs/RELEASE-CHECKLIST.md).

Cloud-hosted execution, cross-device thread sync, and broad general-chat features remain post-1.0 unless supported by stable public Codex interfaces. The product stays repository-first.

## Release gates

The automated release sequence repeatably builds all three package types, inspects their metadata and update hashes, verifies checksums and the SBOM, runs protocol/login/approval fixtures, launches the AppImage with a minimal desktop `PATH`, probes AppImage and extracted Debian payloads on the available display backends, and reopens migrated 0.8 state from AppImage with the Debian payload. Snap metadata, payload, and launcher integrity are automated; an installed Snap is a manual gate.

Automation does not claim to test native package installation, real credentials, compositor shortcuts, portal prompts, camera hardware, desktop notification delivery, or spoken output. Every exact candidate package must therefore pass the manual GNOME/KDE × Wayland/X11 matrix. Public release builds must carry verified GitHub/Sigstore provenance and SBOM attestations, and Snap Store publication requires classic-confinement approval. Release assets are write-once per version and tag: changed bytes always require a new identity. See [RELEASING.md](docs/RELEASING.md) for the exact-artifact release process.
