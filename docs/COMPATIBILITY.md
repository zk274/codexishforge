# CodeXishForge compatibility and recovery

CodeXishForge version 0.9 treats the installed Codex CLI as a versioned external interface. Before starting `codex app-server`, the app generates the CLI's JSON schema with `--experimental`, falling back to the stable schema only when necessary. It compares advertised methods with cumulative profiles:

| Profile | Required surface | Degradation behavior |
| --- | --- | --- |
| `core-v1` | threads, turns, models, account, streaming | Missing methods block connection with upgrade guidance |
| `desktop-v1` | authentication, terminal, diffs, approvals | Missing features remain visibly unavailable |
| `extensions-v1` | skills, plugins, MCP, configuration | Extension actions are capability-gated |
| `creation-v2` | thread search and realtime voice | Local Canvas/templates remain available |

The schema fingerprint and highest complete profile are stored with settings. On the next launch, the app compares them with the new schema, reports newly unavailable capabilities, and never invents replacements for unknown methods.

The original 0.9 baseline was verified on 2026-07-29 with `codex-cli 0.146.0-alpha.3.1`. Its experimental schema produced fingerprint `8e5ad854964fbc038bd67f4a`, profile `creation-v2`, and no unavailable feature groups.

On 2026-08-09, the current development head was rechecked with `codex-cli 0.146.0-alpha.9.2`. Its experimental schema produced fingerprint `b6f6c624723c202169ceed4b`, profile `creation-v2`, and no unavailable feature groups. The schema change did not remove a required capability. The exact 1.0 release candidate must record a fresh CLI version, fingerprint, profile, and unavailable-feature result; these development baselines are evidence, not a promise that an experimental upstream protocol will never change.

## Local-state migrations

Settings, tasks, and Creation Studio data carry explicit schema versions and migrate one version at a time. Writes use a same-directory temporary file, restrictive `0600` permissions, file synchronization, atomic rename, and directory synchronization where the platform supports them.

Before replacing a valid primary file, the previous version becomes `.backup`. The first successful schema migration also preserves its original source as a private `.migration-backup`, which ordinary saves do not rotate. A corrupt primary is restored from a valid backup. A corrupt file without a valid backup, a failed migration, or a state version newer than this app is exposed as read-only defaults; the source is preserved for recovery instead of being overwritten.

Storage source, version, recovery, writability, and bounded failure state appear in diagnostics.

The release gate copies exact 0.8-format fixtures into an isolated Linux profile, launches the packaged AppImage to migrate them, and then reopens the migrated profile with the extracted Debian executable. It verifies preserved settings, update preferences, tasks, inbox items, templates, artifacts, private file modes, and legacy backups. Separate packaged runs prove corrupt-primary recovery and byte-for-byte protection of unsupported future state. A sentinel in the isolated Codex CLI authentication directory must remain unchanged throughout; package upgrades do not own or rewrite CLI credentials.
