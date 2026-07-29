# Codex Linux Community

An unofficial Linux desktop client powered by the installed OpenAI Codex CLI. It provides a focused, native-feeling workspace for persistent coding threads while reusing your existing Codex login, configuration, skills, plugins, MCP servers, and local history.

> This project is independent community software. It is not an official OpenAI product, and it does not contain or redistribute the proprietary macOS or Windows Codex applications.

## What works

- Open any local project in a new persistent Codex thread
- Browse, search, and resume existing CLI and app threads
- Stream agent messages, reasoning, terminal output, file changes, and tool calls
- Render Markdown, highlighted code, tables, links, and copyable code blocks
- Attach files and images using the file picker, clipboard, or drag and drop
- Capture full screens and application windows, or drag-select a precise region, as image attachments
- Preview an available webcam, switch cameras, and capture a still image attachment; microphone permission is requested only after starting voice
- Dictate editable prompts through the installed Codex realtime interface, with capability-gated live voice conversations
- Draft and preview durable Markdown plans, specifications, documentation, and notes in a local Canvas
- Search across Codex threads, task outcomes, repository files, and Canvas artifacts
- Save and reuse built-in or custom task templates from the Task Center
- Review Git branches plus working, staged, and current-turn diffs per file
- Stage, unstage, safely discard working changes, and commit staged changes
- Review working changes per hunk, stage accepted hunks, and reject individual hunks after confirmation
- Discover and run repository-native checks with bounded test evidence attached to the review
- Create branches, commit, push without force, and open draft pull requests behind separate confirmation boundaries
- Inspect GitHub issues, pull requests, reviews, inline comments, Actions runs, and default-branch protection when GitHub CLI is authenticated
- See repository contribution guidance, Codex policy, hooks, code owners, and workflow files before publishing
- Copy shareable diagnostics and task summaries that omit paths, identifiers, prompts, responses, account data, logs, and credentials
- Run multiple persistent interactive project terminals with tabs, lifecycle state, and background-output indicators
- Approve commands, file writes, permission grants, MCP forms, and Codex questions
- Answer questions Codex asks during a turn
- Configure or disable the global quick-prompt shortcut, with conflict and Wayland compositor guidance
- Show, quick-prompt, or quit from the Linux system tray, with optional close-to-tray behavior
- Launch at login through a managed XDG autostart entry, starting quietly in the tray when available
- Open `codex-linux://` links in one running app instance to focus Codex, resume a thread, or confirm and open a local project
- Check stable or beta release channels, explicitly download verified updates, and restart to install supported Linux packages
- Receive configurable, privacy-safe notifications for completed turns, approval requests, questions, and background terminal exits
- Use the complete interface by keyboard, with visible focus, contained dialog focus, reduced motion, text scaling, high contrast, system accessibility preference support, and an optional screen-reader announcement mode
- Restore the last active thread after restarting
- Preflight the installed CLI's version-specific app-server schema against a compatibility matrix, blocking incompatible builds and gracefully gating unavailable optional features
- Inspect and manage installed skills, plugins, and MCP servers from a capability-gated Extension Center
- Check extension health and open the user, project, system, or managed configuration layer that owns a setting
- Queue durable background tasks with explicit queued, preparing, running, waiting, failed, stopped, and completed states
- Run concurrent tasks in managed detached Git worktrees without touching the local checkout
- Inspect subagent ownership, handoffs, models, reasoning effort, status, and task resource usage
- Recover active task threads after application or CLI restarts
- Review approvals, questions, task results, failures, and background-terminal errors in one inbox
- Collect rotating, credential-redacted diagnostics with state-recovery and performance health, plus optional crash and compatibility reporting that is off by default
- Detect unclean shutdowns and offer renderer crash recovery
- Choose an available model and reasoning effort
- Stop an active turn
- Sign in to ChatGPT from the app or use API-key authentication configured in the CLI
- Recover from CLI discovery failures by selecting an executable
- Build AppImage, Debian, and Ubuntu Snap packages

## Requirements

- A modern x86_64 or arm64 Linux desktop
- Node.js 22.12 or newer for development
- The current [OpenAI Codex CLI](https://developers.openai.com/codex/cli/) installed and available as `codex`
- An authenticated CLI session (`codex login` or an API key supported by the CLI)
- Optional: authenticated [GitHub CLI](https://cli.github.com/) for private issue, pull-request, review, Actions, policy, and draft-PR context; Git push uses the remote's configured credentials

If a desktop launcher cannot find your CLI, set `CODEX_CLI_PATH` to its absolute path before starting the app. The client checks common install locations and Codex binaries bundled with OpenAI extensions installed in VS Code, VS Code Insiders, VSCodium, Cursor, and Windsurf. If discovery still fails, open the account panel in the lower-left corner and select **Locate Codex CLI**.

## Run from source

```bash
npm install
npm start
```

The development launcher removes `ELECTRON_RUN_AS_NODE` because Codex-hosted shells may set it. This only affects local development; packaged desktop launches use Electron normally.

## Keyboard and accessibility

Open account settings with **Ctrl+,** to choose 100–150% text size, reduced motion, high contrast, or screen-reader mode. Screen-reader mode announces completed turns and requests for decisions without reading every streamed token. Codex also follows the desktop's reduced-motion, increased-contrast, and forced-color preferences.

Use **Ctrl+N** for a new thread, **Ctrl+K** or **/** to search threads, **Ctrl+J** for the terminal, **Ctrl+Shift+B** for background tasks, **Ctrl+Shift+R** for the Review Center, **Ctrl+Shift+F** for workspace search, **Alt+Left** to return home, and **F6** to cycle through the primary work areas. Arrow keys navigate thread lists and tabs. In region capture, arrow keys move the selection and **Shift+Arrow** resizes it. Dialogs contain keyboard focus and close with **Escape**.

## Task Center

Select **Tasks** in the title bar to queue work that can continue while you use another thread. The queue runs at most two top-level tasks concurrently and displays queued, preparing, running, waiting, recovering, completed, failed, and stopped states. Requests and results also appear in the unified inbox.

**Isolated worktree** is the default. The app creates a detached checkout beneath its private user-data directory from the selected Git revision, then starts a separate persisted Codex thread in that directory. The local checkout and its uncommitted changes are not copied or modified. Choose **Local checkout** only when intentional shared-file access is appropriate.

Task metadata is written atomically to a mode-`0600` local JSON file. On restart, queued tasks return to the queue and active tasks resume their saved Codex threads. Managed worktrees are retained for inspection and reuse; the Task Center can open them directly.

Settings, task state, and Creation Studio state use explicit schema versions. A valid prior file is retained as a private backup during migration. Corrupt primary data is recovered from that backup when possible; unknown future versions and failed migrations are opened read-only rather than overwritten.

Subagent activity comes from Codex’s structured collaboration items. The interface shows ownership, status, handoffs, selected model and reasoning effort when available, while Codex remains responsible for spawning, steering, limits, and sandbox inheritance.

## Creation Studio

Select **Studio** in the title bar for Canvas, workspace search, templates, and voice.

Canvas artifacts are Markdown plans, specifications, documentation, or notes stored atomically in the application's private user-data directory. The split editor provides a sanitized live preview. An artifact can be attached to a Codex prompt or explicitly exported as a Markdown file; deleting one requires native confirmation.

Workspace search combines the Codex CLI's thread search when advertised, background-task outcomes, Canvas artifacts, and bounded local repository scanning. File search skips dependency and build directories, symlinks, environment files, credential-like names, and private-key formats. File results can only reveal files inside the active thread's repository.

Task templates preserve a prompt, worktree/local isolation, starting revision, model, and reasoning choice. Four built-in repository workflows are included, while custom templates persist locally and can be managed from Studio or applied in the Task Center.

The composer microphone starts dictation only when the installed CLI advertises the complete experimental realtime voice surface. Audio is streamed during the active session as bounded mono PCM chunks. Dictation uses client-managed handoffs, writes transcript text into the editable composer, and never starts a Codex turn until **Send** is pressed. Studio can also begin an experimental realtime voice conversation when the account, rollout, and workspace support it. Without that capability, every non-voice Creation Studio feature remains available.

## Review Center

Select **Review** in the title bar to review the active repository before shipping. Working-tree diffs are reparsed in the main process into stable per-hunk patches. **Accept & stage** applies the exact regenerated hunk to the index; **Reject hunk** first asks for confirmation, checks that the hunk still matches, and reverses only that working-tree patch. Binary changes remain file-level operations.

The Evidence & ship tab discovers bounded repository-native checks such as `npm run check`, `cargo test`, `go test ./...`, or `python -m pytest`. Results, exit codes, durations, and capped output stay in memory as review evidence. Branch creation, commit, non-forced push, and draft pull-request creation each require a separate native confirmation.

GitHub context uses the user-installed `gh` executable and its existing authentication. Install GitHub CLI and run `gh auth login` to load private issues, pull requests, review comments, Actions runs, branch protection, and create draft pull requests. Push uses the repository's existing Git remote credentials; the app never force-pushes. Authentication tokens and raw GitHub configuration never enter the renderer or application state. Without `gh`, local review, policy, evidence, branch, commit, and Git push workflows continue to work.

The Policy & share tab inventories metadata for `AGENTS.md`, project Codex configuration and requirements, contribution guides, code owners, security policy, pull-request templates, workflows, Git hooks, and available default-branch protection. It does not read policy file contents into the renderer. Shareable summaries deliberately omit sensitive task and diagnostic text.

## Extension Center

Open the application menu beside **Codex Linux**, then select **Extensions**. The Extension Center lists skills for the current project, installed plugins, active MCP servers, health issues, and effective Codex configuration layers.

Skill enablement uses the supported Codex skill API. Plugin and MCP toggles write only the owning user or trusted-project configuration layer through Codex's atomic configuration API; system and managed layers remain read-only. Plugin inventory is labeled **Preview** and automatically disappears on CLI versions that do not expose it.

Raw `config.toml` values, MCP commands, URLs, environment variables, headers, and credentials never cross the preload bridge. The UI receives only bounded names, descriptions, counts, health states, and configuration file paths.

## Deep links

Installed packages register the `codex-linux` URL scheme. Supported links are intentionally limited:

```text
codex-linux://open
codex-linux://thread/THREAD_ID
codex-linux://project?path=%2Fabsolute%2Fproject
```

Project links show the resolved local directory and require confirmation. Links cannot contain prompts, commands, credentials, or relative paths.

## Verify and package

```bash
npm run check
npm run dist
npm run verify:artifacts
npm run trust:generate
npm run trust:verify
npm run verify:desktop
npm run smoke:package
npm run smoke:upgrade
```

Packages are written to `dist/`. The build produces an AppImage, a `.deb` installer, and a classic-confinement `.snap`.

`npm run release:verify` runs the complete sequence. Artifact verification checks package versions, architectures, Snap confinement, update metadata, sizes, and SHA-512 hashes. Release-trust verification generates SHA-256 checksums, a versioned manifest, and a CycloneDX SBOM that includes the packaged Electron runtime. Desktop compatibility verification launches AppImage and Debian payloads against each actually available Wayland/X11 backend and records renderer, window, tray, shortcut, notification, and pixel-capture evidence. Public release builds receive signed GitHub/Sigstore provenance and SBOM attestations; see [release integrity and provenance](docs/RELEASE-TRUST.md) and the [Linux desktop compatibility matrix](docs/DESKTOP-COMPATIBILITY.md).

The packaged smoke tests use `xvfb-run` or an existing X display. They launch the AppImage with a clean home directory and minimal desktop `PATH`, then migrate real 0.8 settings, tasks, inbox, templates, and artifacts before reopening the same profile with the Debian package. Corrupt-primary recovery, newer-state protection, and preservation of CLI-owned authentication are also verified. GitHub Actions runs ordinary checks for every pull request and the full release gates for version tags or a manual dispatch.

Classic confinement is intentional: Codex must open user-selected repositories and launch the host CLI. Install a local Snap build with:

```bash
sudo snap install --classic --dangerous "dist/Codex Linux Community-0.9.0-amd64.snap"
```

Publishing a classic snap in the Snap Store requires a confinement review.

## Update channels

Packaged AppImage and Debian builds can check GitHub Releases for updates. The stable channel reads `latest` metadata; the beta channel also accepts prerelease builds. Checks can run automatically, but downloads and installation always require explicit confirmation. Snap updates remain managed by the Snap Store.

Release builds generate update metadata with SHA-512 artifact hashes. Update versions, file names, URLs, sizes, and hashes are validated before download is enabled; downgrades, automatic downloads, and automatic installation on quit are disabled. Stable versions use ordinary semantic versions such as `0.9.0`; beta versions use a suffix such as `1.0.0-beta.1` and must be published as GitHub prereleases. The build script configures both the metadata channel and release type, while publishing remains a separate, explicit action.

## Architecture

The renderer is a dependency-free HTML/CSS/JavaScript interface running with Electron context isolation, Node integration disabled, renderer sandboxing enabled, and a restrictive content security policy. A narrow preload bridge sends validated desktop actions to the main process.

Before connecting, the main process asks the installed CLI to generate its version-specific app-server schema and checks the methods needed for core threads, authentication, approvals, change streaming, terminals, extensions, search, and realtime voice. It records a schema fingerprint and the highest complete compatibility profile. Incompatible core protocols stop with upgrade guidance; partial protocols keep supported workflows available, and newly unavailable features are reported without guessing protocol behavior. It then starts `codex app-server --stdio`, performs the required `initialize`/`initialized` handshake, and communicates through the line-delimited JSON protocol. Background tasks and voice use structured protocol events. Creation artifacts and templates remain local; Review and Git operations are validated independently in the main process; optional GitHub context uses GitHub CLI authentication. Credentials remain owned by the Codex and GitHub CLIs; the desktop app does not collect or store them.

Open the **•••** menu for diagnostics. Reports include runtime, compatibility, migration, security, and performance-budget state plus recent structured events. Authorization headers, API keys, tokens, passwords, cookies, private keys, secrets, and OAuth query values are redacted before logs are written. Logs rotate under the application's user-data directory.

Crash and compatibility reporting is disabled by default. Enabling it in Settings sends nothing unless the application has also been configured with a maintainer-controlled HTTPS endpoint. The fixed report schema can include the application, platform, crash reason, Codex version, protocol status/profile, and missing method names. It never includes prompts, responses, paths, logs, credentials, attachments, account data, or arbitrary renderer fields; **Copy report preview** shows the exact bounded shape locally.

## Current scope

Version 0.9 is the stabilization milestone built on the CLI's experimental app-server protocol. Core local coding, Git review, optional GitHub collaboration, extension control, background tasks, worktrees, agent activity, local creation, search, templates, and capability-gated realtime voice are present. Cloud task management and public plugin browsing or installation are not yet exposed. Unknown server requests are rejected safely instead of being guessed. See [ROADMAP.md](ROADMAP.md) for the remaining 1.0 trust and distribution gates.

## Safety and privacy

New foreground and background threads default to `workspace-write` sandboxing and `on-request` approvals. Subagents inherit the parent task’s Codex permission boundary. External links are restricted to HTTPS. All model and tool activity follows the permissions, managed policy, hooks, and configuration enforced by your installed Codex CLI.

Detailed 0.9 records: [compatibility and recovery](docs/COMPATIBILITY.md), [Linux desktop compatibility](docs/DESKTOP-COMPATIBILITY.md), [performance budgets](docs/PERFORMANCE.md), [security review](docs/SECURITY.md), and [accessibility test matrix](docs/ACCESSIBILITY.md).

## License

MIT. “OpenAI” and “Codex” are trademarks of OpenAI; their use here identifies compatibility only.
