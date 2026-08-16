# Security policy

## Supported versions

The latest stable release is the only supported production line and receives qualifying security fixes in the next patch or stable release. Beta and release-candidate builds are unsupported for production but best-effort test reports are welcome. Private development, repackaged, and superseded builds are unsupported; reports are still welcome when they demonstrate a defect in current `main`.

Version 0.9.0 was a private development milestone, not a supported public release.

## Report a vulnerability privately

Use **Security → Report a vulnerability** in the canonical GitHub repository. That route creates a private vulnerability report visible only to the reporter and maintainers. Public release is blocked until repository private vulnerability reporting is enabled and this button is verified from a non-maintainer account.

Do not open a public issue with exploit details, credentials, prompts, responses, account identifiers, private repository content, or complete local paths. If the private reporting button is unavailable, disclose no sensitive details publicly; a maintainer must repair the private route first.

Include the affected version and package, Linux desktop/session, impact, minimal reproduction, and any suggested mitigation. Use a disposable project and test account. Maintainers will acknowledge and triage reports on a best-effort basis; there is no response-time SLA.

The runtime security boundaries and threat review are documented in [docs/SECURITY.md](../docs/SECURITY.md).
