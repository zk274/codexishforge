# Release integrity and provenance

Every release-gate build produces a complete trust set beside the Linux packages:

| File | Purpose |
| --- | --- |
| `SHA256SUMS` | SHA-256 digests for every package, update file, manifest, and SBOM |
| `release-manifest.json` | Versioned package names, sizes, digests, architecture, channel, source repository, commit, and workflow |
| `release-sbom.cdx.json` | Reproducible CycloneDX 1.6 inventory of shipped npm dependencies and the packaged Electron runtime |
| `release-provenance.sigstore.json` | Signed SLSA build-provenance bundle, generated for public release builds |
| `release-sbom.sigstore.json` | Signed SBOM attestation bundle, generated for public release builds |

`npm run trust:generate` derives the SBOM, manifest, and checksum set from the built artifacts. `npm run trust:verify` independently rehashes every subject, requires the exact release file set, cross-checks all manifest sizes and digests, and confirms that the SBOM identifies both the application and packaged Electron version. `npm run release:verify` runs both commands after package inspection and before packaged launch and upgrade tests.

## Verify a downloaded release

Place all downloaded release files in one directory and run:

```bash
sha256sum --check SHA256SUMS
```

After the repository is public and the release workflow has produced GitHub/Sigstore attestations, verify that a package came from this repository and its release workflow:

```bash
gh attestation verify "Codex Linux Community-1.0.0-x86_64.AppImage" \
  --repo zk274/linuxcodexzk \
  --signer-workflow zk274/linuxcodexzk/.github/workflows/release-gates.yml
```

Repeat the command for the Debian or Snap file being installed. Verification establishes the source repository, workflow, commit, and artifact digest; it does not claim that the software is free of vulnerabilities.

## Private development phase

The repository remains private until 1.0. GitHub-hosted artifact attestations for private repositories require GitHub Enterprise Cloud. The private release gate therefore generates and verifies the full checksum, manifest, and SBOM set but deliberately does not send private build identities to Sigstore's public transparency log. The attestation steps are visibility-gated and activate automatically for the public 1.0 release.

## Release manifest v1

`release-manifest.json` uses schema identifier `community.codexlinux.release-manifest.v1`. Subject paths are plain filenames, source commits are either a complete lowercase Git SHA or `null` for local builds, and all artifact digests are lowercase SHA-256. `SHA256SUMS` is the authoritative subject list passed to the provenance and SBOM attestation actions.
