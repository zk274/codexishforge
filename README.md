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
- Preview an available webcam, switch cameras, and capture a still image attachment without requesting microphone access
- Review Git branches plus working, staged, and current-turn diffs per file
- Stage, unstage, safely discard working changes, and commit staged changes
- Run multiple persistent interactive project terminals with tabs, lifecycle state, and background-output indicators
- Approve commands, file writes, permission grants, MCP forms, and Codex questions
- Answer questions Codex asks during a turn
- Configure or disable the global quick-prompt shortcut, with conflict and Wayland compositor guidance
- Show, quick-prompt, or quit from the Linux system tray, with optional close-to-tray behavior
- Launch at login through a managed XDG autostart entry, starting quietly in the tray when available
- Open `codex-linux://` links in one running app instance to focus Codex, resume a thread, or confirm and open a local project
- Check stable or beta release channels, explicitly download verified updates, and restart to install supported Linux packages
- Receive configurable, privacy-safe notifications for completed turns, approval requests, questions, and background terminal exits
- Use the complete interface by keyboard, with visible focus, contained dialog focus, reduced motion, text scaling, high contrast, and system accessibility preference support
- Restore the last active thread after restarting
- Preflight the installed CLI's version-specific app-server schema, blocking incompatible builds and gating unavailable optional features
- Inspect and manage installed skills, plugins, and MCP servers from a capability-gated Extension Center
- Check extension health and open the user, project, system, or managed configuration layer that owns a setting
- Queue durable background tasks with explicit queued, preparing, running, waiting, failed, stopped, and completed states
- Run concurrent tasks in managed detached Git worktrees without touching the local checkout
- Inspect subagent ownership, handoffs, models, reasoning effort, status, and task resource usage
- Recover active task threads after application or CLI restarts
- Review approvals, questions, task results, failures, and background-terminal errors in one inbox
- Collect rotating, credential-redacted diagnostics with copy/export controls
- Detect unclean shutdowns and offer renderer crash recovery
- Choose an available model and reasoning effort
- Stop an active turn
- Sign in to ChatGPT from the app or use API-key authentication configured in the CLI
- Recover from CLI discovery failures by selecting an executable
- Build AppImage, Debian, and Ubuntu Snap packages

## Requirements

- A modern x86_64 or arm64 Linux desktop
- Node.js 22 or newer for development
- The current [OpenAI Codex CLI](https://developers.openai.com/codex/cli/) installed and available as `codex`
- An authenticated CLI session (`codex login` or an API key supported by the CLI)

If a desktop launcher cannot find your CLI, set `CODEX_CLI_PATH` to its absolute path before starting the app. The client checks common install locations and Codex binaries bundled with OpenAI extensions installed in VS Code, VS Code Insiders, VSCodium, Cursor, and Windsurf. If discovery still fails, open the account panel in the lower-left corner and select **Locate Codex CLI**.

## Run from source

```bash
npm install
npm start
```

The development launcher removes `ELECTRON_RUN_AS_NODE` because Codex-hosted shells may set it. This only affects local development; packaged desktop launches use Electron normally.

## Keyboard and accessibility

Open account settings with **Ctrl+,** to choose 100–150% text size, reduced motion, or high contrast. Codex also follows the desktop's reduced-motion, increased-contrast, and forced-color preferences.

Use **Ctrl+N** for a new thread, **Ctrl+K** or **/** to search threads, **Ctrl+J** for the terminal, **Ctrl+Shift+B** for background tasks, **Alt+Left** to return home, and **F6** to cycle through the primary work areas. Arrow keys navigate thread lists and tabs. In region capture, arrow keys move the selection and **Shift+Arrow** resizes it. Dialogs contain keyboard focus and close with **Escape**.

## Task Center

Select **Tasks** in the title bar to queue work that can continue while you use another thread. The queue runs at most two top-level tasks concurrently and displays queued, preparing, running, waiting, recovering, completed, failed, and stopped states. Requests and results also appear in the unified inbox.

**Isolated worktree** is the default. The app creates a detached checkout beneath its private user-data directory from the selected Git revision, then starts a separate persisted Codex thread in that directory. The local checkout and its uncommitted changes are not copied or modified. Choose **Local checkout** only when intentional shared-file access is appropriate.

Task metadata is written atomically to a mode-`0600` local JSON file. On restart, queued tasks return to the queue and active tasks resume their saved Codex threads. Managed worktrees are retained for inspection and reuse; the Task Center can open them directly.

Subagent activity comes from Codex’s structured collaboration items. The interface shows ownership, status, handoffs, selected model and reasoning effort when available, while Codex remains responsible for spawning, steering, limits, and sandbox inheritance.

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
npm run smoke:package
```

Packages are written to `dist/`. The build produces an AppImage, a `.deb` installer, and a classic-confinement `.snap`.

`npm run release:verify` runs the complete sequence. Artifact verification checks package versions, architectures, Snap confinement, update metadata, sizes, and SHA-512 hashes. The packaged smoke test uses `xvfb-run` or an existing X display; it launches the AppImage with a clean home directory and a minimal desktop `PATH`, verifies the renderer, and exits automatically. GitHub Actions runs ordinary checks for every pull request and the full release gates for version tags or a manual dispatch.

Classic confinement is intentional: Codex must open user-selected repositories and launch the host CLI. Install a local Snap build with:

```bash
sudo snap install --classic --dangerous "dist/Codex Linux Community-0.6.0-amd64.snap"
```

Publishing a classic snap in the Snap Store requires a confinement review.

## Update channels

Packaged AppImage and Debian builds can check GitHub Releases for updates. The stable channel reads `latest` metadata; the beta channel also accepts prerelease builds. Checks can run automatically, but downloads and installation always require explicit confirmation. Snap updates remain managed by the Snap Store.

Release builds generate update metadata with SHA-512 artifact hashes. Stable versions use ordinary semantic versions such as `0.3.0`; beta versions use a suffix such as `0.4.0-beta.1` and must be published as GitHub prereleases. The build script configures both the metadata channel and release type, while publishing remains a separate, explicit action.

## Architecture

The renderer is a dependency-free HTML/CSS/JavaScript interface running with Electron context isolation, Node integration disabled, renderer sandboxing enabled, and a restrictive content security policy. A narrow preload bridge sends validated desktop actions to the main process.

Before connecting, the main process asks the installed CLI to generate its version-specific app-server schema and checks the methods needed for core threads, authentication, approvals, change streaming, and terminals. Incompatible core protocols stop with upgrade guidance; partial protocols keep supported workflows available. It then starts `codex app-server --stdio`, performs the required `initialize`/`initialized` handshake, and communicates through the line-delimited JSON protocol. Background tasks use the same structured thread, turn, request, status, and collaboration events. Credentials remain owned by the Codex CLI; the desktop app does not collect or store them.

Open the **•••** menu for diagnostics. Reports include runtime and compatibility state plus recent structured events. Authorization headers, API keys, tokens, passwords, secrets, and OAuth query values are redacted before logs are written. Logs rotate under the application's user-data directory.

## Current scope

This is an early desktop client built on the CLI's experimental app-server protocol. Core local coding, Git, extension-control, background-task, worktree, and agent-activity workflows are present, but GitHub collaboration screens, cloud task management, voice/realtime mode, public plugin browsing and installation, and Canvas-style editing are not yet exposed. Unknown server requests are rejected safely instead of being guessed. See [ROADMAP.md](ROADMAP.md) for the next desktop-focused milestones.

## Safety and privacy

New foreground and background threads default to `workspace-write` sandboxing and `on-request` approvals. Subagents inherit the parent task’s Codex permission boundary. External links are restricted to HTTPS. All model and tool activity follows the permissions, managed policy, hooks, and configuration enforced by your installed Codex CLI.

## License

MIT. “OpenAI” and “Codex” are trademarks of OpenAI; their use here identifies compatibility only.
