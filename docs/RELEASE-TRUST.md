# CodeXishForge release integrity and provenance

Every CodeXishForge release-gate build produces a complete trust set beside the Linux packages:

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
gh attestation verify "CodeXishForge-1.0.0-x86_64.AppImage" \
  --repo zk274/codexishforge \
  --signer-workflow zk274/codexishforge/.github/workflows/release-gates.yml
```

Repeat the command for the Debian or Snap file being installed. Add `--predicate-type https://cyclonedx.org/bom` to verify the package's signed CycloneDX SBOM attestation. Verification establishes the source repository, workflow, commit, and artifact digest; it does not claim that the software is free of vulnerabilities.

Public tag builds first verify that the exact version tag is annotated and refuse an existing release identity before building or signing. They then verify checksums and create both attestation bundles in a dedicated least-privilege job that does not execute repository code. A separate job re-verifies the complete downloaded release set and both attestations. After the protected `release` environment is approved, it creates a write-once **draft** GitHub Release and uploads the verified packages, update metadata, manifest, SBOM, checksums, and attestation bundles. The workflow repeats the existing-release refusal immediately before draft creation as a defense in depth. After draft creation, every subsequent run or different output requires a new version and tag. A run that fails before creating the draft may retry the same tag. Publishing remains a deliberate maintainer action. Stable versions use `latest-linux.yml`; both `beta` and `rc` versions use `beta-linux.yml` and become updater-visible only after the verified draft is deliberately published as a prerelease.

## Private preparation phase

The repository may remain private during 1.0 preparation, but the canonical repository must become public before the first attested RC tag. GitHub-hosted artifact attestations for private repositories require GitHub Enterprise Cloud. The private release gate therefore generates and verifies the full checksum, manifest, and SBOM set without sending private build identities to Sigstore's public transparency log. After the repository is public, the visibility-gated attestation steps activate for each RC and for the separate final `1.0.0` build.

## Release manifest v1

`release-manifest.json` uses schema identifier `io.github.zk274.codexishforge.release-manifest.v1`, and its `product.appId` is `io.github.zk274.codexishforge`. The application component in `release-sbom.cdx.json` uses the same durable namespace for its `io.github.zk274.codexishforge:distribution` property. Subject paths are plain filenames, source commits are either a complete lowercase Git SHA or `null` for local builds, and all artifact digests are lowercase SHA-256. `SHA256SUMS` is the authoritative subject list passed to the provenance and SBOM attestation actions.
