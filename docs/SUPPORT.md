# CodeXishForge support policy

CodeXishForge is maintained without a service-level agreement. Release support is intentionally narrow enough that a small community project can honor it.

## Supported releases

| Release channel | Support level |
| --- | --- |
| Latest stable release | Supported; security fixes and qualifying bug fixes target the next patch or stable release |
| Superseded stable releases | Unsupported after the next stable release is published |
| Beta and release-candidate builds | Unsupported for production; test feedback is handled on a best-effort basis and users must be prepared to update or roll back |
| Local development builds | Unsupported |

Only the exact package artifacts attached to the canonical GitHub Release are supported. Each stable release's notes define its supported architecture and tested Linux distribution, desktop, and session baselines; “modern Linux” does not imply every distribution or compositor version. Repacked, modified, or third-party builds should be reported to their distributor.

There is no fixed calendar cadence. Stable releases are published when the [release checklist](RELEASE-CHECKLIST.md) passes. Prereleases may be published as needed to collect exact-artifact compatibility evidence. Critical security fixes may produce an out-of-cycle stable release.

## Codex CLI compatibility

CodeXishForge uses the installed OpenAI Codex CLI as a versioned external interface. Each stable release records the tested CLI version and highest complete compatibility profile in [COMPATIBILITY.md](COMPATIBILITY.md) and in its release evidence. CodeXishForge is independent community software; compatibility does not imply affiliation, endorsement, or sponsorship by OpenAI.

The exact CLI version recorded for a stable release is its tested target; a later upstream “current” CLI does not become supported automatically. Older or newer CLI versions may continue to work when their advertised schema satisfies a known profile, but optional features can be disabled and an incompatible core protocol is blocked with upgrade guidance. The app does not replace, patch, or own CLI authentication data.

## State, migration, and recovery

Stable releases migrate settings and application state atomically, retain a private backup of the previous valid state, and refuse to overwrite unknown future formats. Package removal must not delete user-owned application state unless the user explicitly requests that removal.

Before upgrading, users who need an additional recovery point should back up the application data directory shown in Diagnostics. Codex CLI credentials remain owned by the CLI and are outside the desktop app's migration boundary.

## Getting help

Use GitHub Issues for reproducible, non-sensitive defects against a supported release. Include the package type, version, desktop/session, and a redacted diagnostics report. Do not post prompts, responses, credentials, account identifiers, private repository content, or full local paths.

Security reports need a private channel. Public release is blocked until private vulnerability reporting is enabled on the canonical GitHub repository and the reporting route is linked from the repository security policy. Do not disclose exploit details in a public issue.
