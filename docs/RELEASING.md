# CodeXishForge release process

This process turns one exact CodeXishForge source commit into one write-once set of Linux release artifacts. A version label alone is never release evidence, and an RC artifact is never renamed or repackaged as stable.

## Channels and versions

| Channel | Version form | GitHub release |
| --- | --- | --- |
| Stable | `1.0.0` | Write-once draft until all final prepublication gates pass; then deliberately published as latest |
| Release candidate | `1.0.0-rc.1` | Write-once draft, then deliberately published as a prerelease after its prepublication gates pass |
| Beta | `1.0.0-beta.1` | Write-once draft, then deliberately published as a prerelease when its stated gates pass |

Release candidates and betas use the updater's beta channel and are invisible to that channel while still drafts. A stable client never installs a prerelease. Snap updates remain owned by the Snap Store.

## Freeze prerequisites

Before assigning the first 1.0 candidate:

1. Choose the permanent repository and product identity, release architecture, supported distribution/desktop baselines, and artifact-signing policy. Verified amd64-only is the recommended first-1.0 scope; adding arm64 duplicates every artifact, attestation, updater, package/session, and store-evidence gate.
2. Make the canonical repository public before the first RC tag.
3. Complete the checklist's public repository and security setup: scan complete history for secrets, verify private vulnerability reporting, protect the default branch and release tags, enable immutable releases, require a reviewer on the `release` environment, and record the GitHub Actions trust policy.
4. Confirm the public security contact, Snap Store publisher, classic-confinement request, and human desktop/session test environments.
5. Update the exact tested Codex CLI entry in [COMPATIBILITY.md](COMPATIBILITY.md).
6. Start a fresh copy of the [1.0 release checklist](RELEASE-CHECKLIST.md).

## Build an exact artifact set

1. Update `package.json` and `package-lock.json` to the same semantic version.
2. Update release notes and compatibility evidence, then commit the freeze with a clean worktree.
3. Run `npm ci`, both production and full release-toolchain audits at the low threshold, and `npm run release:verify` locally. Both audits must report zero known advisories.
4. Create an annotated, protected tag exactly matching `v${package.json.version}` and push that tag to the canonical repository.
5. The tag workflow first verifies the annotated tag and refuses an existing release identity. It then repeatably builds and verifies all artifacts, records the source commit, creates public provenance and SBOM attestations, and uploads a write-once **draft** GitHub Release.
6. Download the draft assets into a clean directory. Verify `SHA256SUMS` and use `gh attestation verify` for the AppImage, Debian package, and Snap before any manual testing.

Do not substitute local packages or short-lived Actions artifacts for the draft release assets. Once a draft exists, the workflow refuses to reuse that release identity. Every subsequent run or changed output requires a new version and tag and invalidates the manual evidence for each newly built package; a run that failed before draft creation may retry the same tag.

## RC validation and publication

Run every RC prepublication gate in [RELEASE-CHECKLIST.md] against the downloaded draft assets. This includes:

- the twelve package/desktop/session cells;
- keyboard and visual-mode checks for every package plus four Orca rows on one assigned reference package per desktop/session;
- real-account login, restart, logout, and recovery;
- public provenance and SBOM verification; and
- a store-delivered classic Snap whose store revision and signed assertion map to the candidate digest after confinement review.

When those prepublication gates pass, deliberately publish the unchanged RC draft as a GitHub prerelease. Then run the beta-channel AppImage and Debian updater rehearsal and rollback/recovery check; a draft cannot satisfy this gate because clients cannot discover it. Record only bounded, privacy-safe evidence.

If an RC fails before or after prerelease publication, document the bounded defect and create a new commit, RC version, tag, write-once artifact set, and checklist. Never replace the failed RC's bytes.

## Build and validate final `1.0.0`

After an RC passes its published-prerelease rehearsal, freeze `1.0.0` as a new exact build. Its different version means different bytes and new evidence:

1. Create a fresh checklist for the final commit, `v1.0.0` tag, workflow, filenames, and digests.
2. Repeat every prepublication gate against the final artifacts: repository/security setup, automated verification, all package/session and keyboard/visual cells, the four assigned-package Orca rows, real-account behavior, public attestations, and the Snap Store digest mapping.
3. Keep the final release as a write-once draft until every final prepublication gate passes. RC results remain useful regression context but cannot promote the final bytes.
4. Deliberately publish the unchanged final draft as the latest stable release. Release notes must identify supported architectures and Linux baselines, exact tested CLI version/profile, known limitations, update path, and security-reporting route.

Immediately after publication, run the stable-channel discovery, explicit download/install or restart, state-preservation, and rollback/recovery smoke in the checklist. This check is postpublication by definition and is not an impossible prerequisite for making stable metadata visible.

## Withdraw or roll forward

If the immediate stable-channel smoke fails, mark the release as withdrawn, stop advertising it through updater metadata, publish remediation guidance, and issue a newer fixed version. Never move a release tag or silently replace an artifact under an existing version; recovery always rolls forward to a new immutable identity.

The [support policy](SUPPORT.md) defines cadence and which releases continue to receive fixes.
