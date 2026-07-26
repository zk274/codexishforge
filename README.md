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
- Receive configurable, privacy-safe notifications for completed turns, approval requests, questions, and background terminal exits
- Restore the last active thread after restarting
- Preflight the installed CLI's version-specific app-server schema, blocking incompatible builds and gating unavailable optional features
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

## Verify and package

```bash
npm run check
npm run dist
```

Packages are written to `dist/`. The build produces an AppImage, a `.deb` installer, and a classic-confinement `.snap`.

Classic confinement is intentional: Codex must open user-selected repositories and launch the host CLI. Install a local Snap build with:

```bash
sudo snap install --classic --dangerous "dist/Codex Linux Community-0.3.0-amd64.snap"
```

Publishing a classic snap in the Snap Store requires a confinement review.

## Architecture

The renderer is a dependency-free HTML/CSS/JavaScript interface running with Electron context isolation, Node integration disabled, renderer sandboxing enabled, and a restrictive content security policy. A narrow preload bridge sends validated desktop actions to the main process.

Before connecting, the main process asks the installed CLI to generate its version-specific app-server schema and checks the methods needed for core threads, authentication, approvals, change streaming, and terminals. Incompatible core protocols stop with upgrade guidance; partial protocols keep supported workflows available. It then starts `codex app-server --stdio`, performs the required `initialize`/`initialized` handshake, and communicates through the line-delimited JSON protocol. Credentials remain owned by the Codex CLI; the desktop app does not collect or store them.

Open the **•••** menu for diagnostics. Reports include runtime and compatibility state plus recent structured events. Authorization headers, API keys, tokens, passwords, secrets, and OAuth query values are redacted before logs are written. Logs rotate under the application's user-data directory.

## Current scope

This is an early desktop client built on the CLI's experimental app-server protocol. Core local coding and Git workflows are present, but cloud task management, voice/realtime mode, plugin management screens, and Canvas-style editing are not yet exposed. Unknown server requests are rejected safely instead of being guessed. See [ROADMAP.md](ROADMAP.md) for the next desktop-focused milestones.

## Safety and privacy

New threads default to `workspace-write` sandboxing and `on-request` approvals. External links are restricted to HTTPS. All model and tool activity follows the permissions, managed policy, hooks, and configuration enforced by your installed Codex CLI.

## License

MIT. “OpenAI” and “Codex” are trademarks of OpenAI; their use here identifies compatibility only.
