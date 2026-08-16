# 1.0 exact-artifact release checklist

This checklist evaluates one exact set of Linux artifacts. Use a fresh copy for each published release candidate and again for the separate final `1.0.0` build. Record evidence against artifact digests, not only a version label.

## Evidence rule

Historical 0.9 or earlier release-candidate results are regression evidence only. They do not pass an item for a different build. Draft assets are write-once: once a draft exists, the workflow refuses that release identity, so every subsequent run or changed package or trust-file digest requires a new version, tag, draft, and checklist. A run that failed before draft creation may retry the same tag. Repeat every manual result for each newly built package.

Do not record credentials, prompts, responses, account identifiers, repository paths, or private project content. Evidence should contain only the fields defined below and links to bounded CI reports or issue records.

## Status legend

| Status | Meaning |
| --- | --- |
| Pending | Ready to perform but not yet evidenced for the exact candidate |
| Blocked | A named prerequisite or external decision is missing |
| Pass | Completed for the exact candidate with evidence recorded |
| Fail | Attempted and found a release-blocking defect |
| Waived | Explicit maintainer decision with rationale and scope recorded |

`Pass` requires an evidence link or a bounded note. A waiver must not be used for real-account, provenance, checksum, package-integrity, or required assistive-technology gates.

## Candidate identity

| Field | Value | Status |
| --- | --- | --- |
| Release phase | RC prerelease / final stable | Blocked — phase not assigned |
| Candidate version | Not assigned | Blocked — version and source not frozen |
| Git commit | Not assigned | Blocked — source not frozen |
| Git tag | Not assigned | Blocked — source not frozen |
| Workflow run | Not assigned | Blocked — candidate not built |
| Architecture | `amd64` / `x86_64` | Pending |
| AppImage filename and SHA-256 | Not assigned | Blocked — candidate not built |
| Debian filename and SHA-256 | Not assigned | Blocked — candidate not built |
| Snap filename and SHA-256 | Not assigned | Blocked — candidate not built |
| `SHA256SUMS` SHA-256 | Not assigned | Blocked — candidate not built |
| `release-manifest.json` SHA-256 | Not assigned | Blocked — candidate not built |
| `release-sbom.cdx.json` SHA-256 | Not assigned | Blocked — candidate not built |
| Test coordinator and date | Not assigned | Pending |

This template lists one architecture. If arm64 joins the first stable release, duplicate every package identity field, attestation result, updater asset, package/session cell, and Snap Store mapping for arm64. Evidence for amd64 cannot promote arm64.

## Pre-RC decisions

| Decision | Status | Resolution |
| --- | --- | --- |
| Keep `linuxcodexzk` or rename the repository before public attestations and update publication | Pending | — |
| Candidate version syntax | Pass | Release tooling accepts `1.0.0-rc.N` and maps it to the beta/prerelease updater channel |
| Make the canonical repository public before the first attested RC run | Pending | Required for public attestations and the published-prerelease updater rehearsal |
| Artifact-signing policy | Pass | 1.0 requires GitHub/Sigstore provenance and SBOM attestations for every package; native/detached GPG signatures are not claimed |
| Release architecture | Pending | Recommended first-1.0 scope is verified `amd64`/`x86_64` only; adding arm64 expands every artifact, attestation, updater, package/session, and store-evidence gate |
| Supported Linux baselines | Pending | Name the distributions, versions, architecture, GNOME/KDE versions, and Wayland/X11 sessions that 1.0 release notes will support; “modern Linux” is not a support definition |
| Orca scope | Pass | Run the full spoken-output sweep once per desktop/session on one assigned reference package and digest; every package still completes its keyboard and visual integration cell |
| Confirm the Snap Store submission owner and classic-confinement justification | Pending | — |
| Confirm that `maintainers@codexlinux.community` is controlled and appropriate for public package metadata | Pending | — |
| Accept the two author email addresses exposed by existing Git history, or perform an intentional pre-public history rewrite | Pending | — |

Do not freeze the candidate until these decisions and all associated repository URLs, update endpoints, trust commands, and documentation are resolved.

## Public repository and security setup

These controls must be enabled and evidenced on the final canonical repository before the first RC tag. A generic “security features enabled” note is insufficient.

| Control | Required evidence | Status |
| --- | --- | --- |
| Complete-history secret scan | Tool/version, scope covering every reachable ref and commit, date, and bounded zero-unresolved-findings result | Pending |
| Private vulnerability reporting | Enabled, policy route visible, and **Report a vulnerability** verified from a non-maintainer account | Blocked — canonical public repository pending |
| Default-branch protection or ruleset | Required CI checks, pull-request review, and force-push/deletion restrictions recorded | Blocked — canonical public repository pending |
| Release-tag protection or ruleset | `v*` creation is restricted and existing release tags cannot be moved or deleted through the normal maintainer path | Blocked — canonical public repository pending |
| GitHub release immutability | Immutable releases are enabled so publishing locks the release assets and associated tag | Blocked — canonical public repository pending |
| Protected `release` environment | Required reviewer is configured and deployment approval is exercised before draft creation | Blocked — canonical public repository pending |
| GitHub Actions trust policy | Release actions are pinned to reviewed commit SHAs and permitted Actions/settings are recorded | Pending |
| Canonical identity and URLs | Repository, package metadata, updater endpoints, trust commands, security route, and documentation use the chosen final identity | Blocked — product/repository identity pending |

## Automated gates

All commands must run from a clean checkout of the candidate commit. Attach the workflow URL and the generated bounded reports.

| Gate | Required evidence | Status |
| --- | --- | --- |
| Version and tag agree | Tag is exactly `v${package.json.version}` | Blocked — candidate identity missing |
| Dependency audit | Production and full release-toolchain audits run at the low threshold and report zero known advisories | Pending — current 0.9 development tree passes; repeat after candidate freeze and regenerate the SBOM |
| Source checks and complete unit suite | `npm run check` passes | Blocked — candidate identity missing |
| Repeatable Linux build | AppImage, Debian, Snap, and update metadata produced by `npm run dist`; this does not claim byte-for-byte reproducibility without an independent rebuild comparison | Blocked — candidate identity missing |
| Artifact inspection | `npm run verify:artifacts` passes for names, versions, architectures, Snap launcher/confinement, sizes, and SHA-512 update hashes | Blocked — candidate artifacts missing |
| Trust metadata | `npm run trust:generate` and `npm run trust:verify` pass with the candidate commit in the manifest | Blocked — candidate artifacts missing |
| Packaged backend probe | `npm run verify:desktop` passes and `desktop-compatibility-report.json` is retained | Blocked — candidate artifacts missing |
| Minimal-`PATH` packaged launch | `npm run smoke:package` passes | Blocked — candidate artifacts missing |
| Migration and recovery | `npm run smoke:upgrade` preserves 0.8 state and CLI-owned authentication data | Blocked — candidate artifacts missing |
| Deterministic login/logout and approval fixtures | Unit-level offline fixtures pass for hosted-login response validation, logout sequencing, approval decisions, and question decisions; exact-candidate real-account behavior remains a separate manual gate | Blocked — candidate identity missing |
| Automated accessibility conformance | Names, roles, focus containment, keyboard routes, announcement boundaries, visual modes, and high-zoom layout pass | Blocked — candidate artifacts missing |
| Complete release sequence | `npm run release:verify` passes in the release workflow | Blocked — candidate identity missing |

Automation does not count as evidence of installed desktop entries, native compositor shortcut delivery, visible notification delivery, portal prompts, camera hardware, or spoken output.

## Manual package/session matrix

Every cell uses a clean application profile, an exact candidate package digest, and one of the distribution/desktop versions selected in **Supported Linux baselines**. Record desktop, compositor/session, distribution, package revision, tester, date, result, defects, and evidence link. If arm64 is selected, duplicate the full table for arm64.

| Desktop/session | AppImage | Debian | Classic Snap |
| --- | --- | --- | --- |
| GNOME / Wayland | Blocked — exact candidate missing | Blocked — exact candidate missing | Blocked — exact candidate missing |
| GNOME / X11 | Blocked — exact candidate and session missing | Blocked — exact candidate and session missing | Blocked — exact candidate and session missing |
| KDE Plasma / Wayland | Blocked — exact candidate and session missing | Blocked — exact candidate and session missing | Blocked — exact candidate and session missing |
| KDE Plasma / X11 | Blocked — exact candidate and session missing | Blocked — exact candidate and session missing | Blocked — exact candidate and session missing |

For every cell, verify:

1. Clean launch or installation, expected package identity, application menu/launcher where applicable, and one running instance.
2. `codex-linux:` deep-link routing and an existing-window activation.
3. Tray icon, tray actions, close-to-tray, quit, and native global Quick Prompt shortcut delivery.
4. Completion and approval desktop notifications while unfocused; denial leaves the requested outside-project file uncreated.
5. File attachment, full-screen capture, screenshot picker, region capture, camera preview, and still-image attachment through actual desktop permission/portal prompts.
6. Keyboard-only navigation, visible focus, dialog containment/restoration, and visible actions at 150% text with reduced motion, high contrast, and forced colors.
7. Stable/beta update-channel state and the package-appropriate update behavior.
8. Removal or deletion and preservation of user-owned state; reinstall/relaunch restores that state where applicable.

## Keyboard, visual, and Orca rows

These are human evaluations on one assigned reference package and digest per desktop/session. Every package still completes keyboard navigation and visual-mode checks in its package/session cell; only the full spoken-output sweep is limited to the assigned reference package. Presence of Orca, DOM inspection, or a successful renderer launch is insufficient.

| Desktop/session | Reference package and digest | Status | Evidence |
| --- | --- | --- | --- |
| GNOME / Wayland | Not assigned | Blocked — exact candidate missing | — |
| GNOME / X11 | Not assigned | Blocked — exact candidate and session missing | — |
| KDE Plasma / Wayland | Not assigned | Blocked — exact candidate and session missing | — |
| KDE Plasma / X11 | Not assigned | Blocked — exact candidate and session missing | — |

For every row:

1. Navigate Home, threads, composer, terminal, Tasks, Review, Studio, Extensions, Settings, diagnostics, and every dialog without a pointer.
2. Verify useful names, roles and selected states, visible focus, logical order, `Escape`, and focus restoration.
3. Confirm streaming tokens are not repeatedly spoken and one completed turn produces exactly one completion announcement.
4. Exercise both an approval and a user question; confirm understandable controls and exactly one decision announcement for each request.
5. Repeat at 150% text with reduced motion, high contrast, and forced colors; actions and focus remain visible with no clipped content.
6. Exercise microphone/dictation permission and start/stop behavior if voice remains in the 1.0 feature claim.

## Real-account login/logout

**Status: Blocked — exact candidate and designated package are not assigned.**

Using a maintainer-controlled test project and the installed Codex CLI:

1. Start logged out and initiate the hosted ChatGPT/Codex login from the candidate.
2. Complete login in the browser and confirm the expected account state appears without the app storing credentials.
3. Start and complete one harmless turn, then restart the app and confirm the authenticated state is recovered through the CLI.
4. Log out in the app, restart, and confirm the account is absent while unrelated local state remains intact.
5. Record only candidate identity, package, pass/fail, date, tester, and bounded defect links.

## Published RC beta-channel updater rehearsal

**Status: Blocked — a verified RC has not been deliberately published as a prerelease.**

1. Complete every RC prepublication gate, then deliberately publish the write-once RC draft as a GitHub prerelease. A draft is not updater evidence because clients cannot discover it.
2. Install or launch the designated prior beta-compatible AppImage and Debian package with preserved user state.
3. Confirm the beta channel discovers only the published RC and validates its metadata before enabling download.
4. Explicitly download and install/restart; confirm the exact RC version and artifact digest where exposed.
5. Confirm threads, settings, tasks, artifacts, project selection, and CLI-owned authentication remain intact.
6. Exercise and document rollback/recovery to the designated prior package without deleting user-owned state.
7. Confirm Snap reports store-managed updates instead of offering an in-app install.

## Public provenance and SBOM attestations

**Status: Blocked — repository visibility and candidate workflow run are pending.**

1. Run the release workflow from the public canonical repository at the candidate tag.
2. Retain `release-provenance.sigstore.json` and `release-sbom.sigstore.json` with the candidate artifacts.
3. Run `gh attestation verify` against the canonical repository and exact signer workflow for the AppImage, Debian package, and Snap.
4. Verify `sha256sum --check SHA256SUMS` from a fresh download directory.
5. Confirm that an existing draft for the same tag cannot accept different bytes; changed output requires a new version and tag.
6. Record the public workflow URL and verification output without environment paths or account data.

## Snap Store classic-confinement review

**Status: Pending — external review has not been recorded.**

- [ ] Store name and publisher are reserved.
- [ ] Classic-confinement justification is submitted.
- [ ] Review outcome and reviewer correspondence link are recorded.
- [ ] Store revision and signed assertion are recorded; the assertion's digest verifies the store download, and that downloaded payload's SHA-256 equals the exact candidate Snap SHA-256.
- [ ] Store-delivered candidate installs and launches on the required desktop/session matrix.
- [ ] Store update and rollback/recovery behavior are documented.

## Final `1.0.0` exact build

An RC is never renamed or repackaged as stable. After a published RC passes its beta-channel updater rehearsal:

1. Freeze `1.0.0` at a new source commit and annotated `v1.0.0` tag, then create a fresh checklist with the final filenames and digests.
2. Repeat the public repository/security checks, complete automated gates, every package/session cell, keyboard/visual/Orca rows, real-account check, public provenance verification, and Snap Store digest mapping against the new final artifacts. Prior RC evidence is regression context only.
3. Keep the final GitHub Release as a write-once draft until every prepublication gate is `Pass`. A fix or changed byte requires a new version and tag; never replace an artifact attached to `v1.0.0`.
4. Deliberately publish the unchanged final draft as the stable release.

## Immediate stable-channel smoke and rollback

Stable-channel discovery cannot be proven while the final release is still a draft. Immediately after publishing `1.0.0`:

1. From the designated prior eligible installation, confirm the stable channel discovers only `1.0.0`, validates metadata, and completes the explicit download and restart/install flow. For the first stable release, also validate a fresh stable-channel metadata/download path.
2. Confirm the installed version and artifact digest where exposed, then verify preserved threads, settings, tasks, artifacts, project selection, and CLI-owned authentication.
3. Exercise the documented rollback/recovery path without deleting user-owned state.
4. If this smoke fails, mark the release as withdrawn, stop advertising its updater metadata, publish bounded remediation guidance, and issue a new fixed version. Do not replace the published `1.0.0` bytes.

Promotion is complete only when the exact final digests that passed every prepublication gate are published unchanged and the immediate postpublication stable-channel smoke is recorded.
