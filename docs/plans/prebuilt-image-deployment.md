# Published-image deployment by Git revision

## Contents

1. Contract and assumptions
2. Current integration points
3. Workstreams and dependency order
4. Acceptance tests
5. Rollout and completion evidence

## Contract and assumptions

User requirement: publish prepared images; install/upgrade uses a published image
for the exact clean checked-out repository revision and server architecture when
available, otherwise builds locally on the server. Existing persistent data and
operator commands remain usable. This document is a plan, not implementation.

Proposed registry default: `ghcr.io/galtproject/geesome-node`, configurable.
Registry ownership, publication permission, visibility and supported platforms
must be verified before the first push. Start with server `linux/amd64`; add
`linux/arm64` only after checking the geesome-base image and native dependencies.
The production Dockerfile depends on `microwavedev/geesome-base`, so buildx alone
does not establish multiarchitecture support.

Primary lookup tag: `sha-<full-git-sha>`. Version tags are human-facing aliases;
never select `latest` during deployment. Label images with OCI source and revision.
Resolve a platform-compatible image and pin its digest. Do not overwrite an
existing SHA tag with different contents without an explicit publication policy.
Repository submodules, if present, must match the recorded commits. Reject dirty
tracked files and untracked build inputs rather than mislabel modified sources as
an upstream SHA. Ignore only known excluded build/cache files.

Modes: `auto` (default, pull or build), `pull` (require published image), and
`build` (explicit server build). Missing image/platform uses build in auto mode.
Network/authentication errors are reported distinctly before auto fallback;
pull mode fails. Revision-label mismatch is an integrity error, not a silent
fallback. A failed pull/build must not stop the running deployment.

## Current integration points

- `bash/docker-build.sh`: existing Compose build and cache logic.
- `bash/docker-upgrade-run.sh`: build, ownership preflight, systemd restart,
  readiness, retention. Replace the initial build selection only.
- `bash/docker-rebuild-and-upgrade.sh`: clean-tree check and Git fast-forward.
- `bash/ubuntu-install-docker.sh`: installs Docker and invokes the build; currently
  has an amd64-only apt source and obsolete standalone Compose installation.
- `bash/geesome-docker.service`: later boots invoke Compose directly. Selected
  image state must survive shell exit and reboot, not depend on transient exports.
- `docker-compose.yml`: web currently has a build definition but no explicit
  deployable image reference. Other services/volumes retain their behavior.
- `package.json`: runtime currently invokes Yarn both in `in-docker-start` and
  `start`. Prepared-image mode must bypass both installation paths.

## Workstreams and dependency order

Each workstream is independently assignable; no delegation is required. The
implementing agent owns integration, validation, commits and PR handoff.

### A. Prepared runtime and publisher

Inputs: current Dockerfile, frontend artifact publisher, package scripts.
Outputs: `npm run docker-publish`, pinned SHA image/labels, prepared-image runtime.
Write scope: Dockerfile, new publisher/runtime scripts, package scripts, docs.
Forbidden: credentials in Git, production data changes, automatic release tagging.

Build with buildx for an explicitly supported platform; check Docker login and
clean source identity first. Build and smoke-test before pushing. Record the
resulting revision, platform and digest. Refuse accidental SHA-tag replacement.
Use the existing frontend build stage and cache. Runtime of a published image
must use preinstalled dependencies and prepared frontend assets, then perform
model sync/migrations and start the backend without Yarn or frontend compilation.
Retain explicit source-build mode for custom deployments; invalid prepared assets
must fail clearly rather than unexpectedly build on the immutable fast path.

Complete when a published test image starts without dependency installation or
frontend compilation, its revision label matches the requested SHA, and its
platform is explicitly verified. Full image startup smoke is required in addition
to fixture tests.

### B. Image resolver and persisted selection

Inputs: agreed SHA-tag/label contract from A and existing build script.
Outputs: one shared prepare-image helper used by installer and upgrader.
Write scope: selection helper, Compose image configuration, isolated tests/docs.
Forbidden: stopping services before preparation succeeds; changing volume paths.

Resolve HEAD and server platform, pull from the configured registry, verify label,
and persist the digest in an ignored, dedicated deployment-state file. Use a
Compose override/launcher shared by all operational commands; never overwrite
user `.env`. Local fallback must explicitly build web with the existing helper,
record the resulting local immutable image identity, and work offline thereafter.
Persist selection atomically only on success and retain the previous reference
for recovery. Validate absent/corrupt deployment state and define legacy fallback.

Complete when install, upgrade, logs/ps and systemd all resolve the same selected
image, including after a fresh shell and reboot. A mutable registry tag changing
must not alter the selected digest.

### C. Installer, upgrade and systemd integration

Depends on A and B. Inputs: prepared-image contract, shared resolver and persisted
selection. Outputs: unchanged operator entrypoints with auto/pull/build modes.
Write scope: installer, upgrade scripts, service definition, readiness/docs.
Forbidden: unsolicited pruning, schema rollback, service restart before readiness
of the image, architecture claims unsupported by the base image.

Upgrade pulls Git as today, prepares the image, runs the existing preflight,
recreates containers using the selected image without an implicit Compose build,
and checks readiness before reporting success. Installation uses the same path.
Update Docker installation to use the Compose plugin required by existing scripts;
apply build-memory advice only when a local build is actually needed. Retain
ownership checks, storage mounts, migrations and safe retention. Preserve the
previous image for manual recovery; do not promise automatic DB rollback.

### D. Local release publication and rollout

Depends on A. Inputs: publisher, local Docker, registry credentials and supported
platform evidence. Outputs: a verified image published by the release agent from
the operator’s local machine, with source SHA, digest and release test evidence.
Write scope: release instructions and agent workflow docs. No automatic CI image
build/publication is configured. Never merge a PR as part of publication.

After the user merges the release into master, run release tests locally and
publish that exact clean commit with `npm run docker-publish`. A branch-head image
does not match the merge commit. Add the version alias from the matching release
tag. Verify registry references and record the digest before handing off server
upgrade instructions. Missing local Docker/registry access leaves publication
incomplete; the existing server build fallback still handles unpublished commits.

## Acceptance tests

- Exact SHA/platform available: use digest; no server build, Yarn install or UI build.
- Backend-only image layer invalidation: existing frontend artifact cache reused.
- Missing SHA or unsupported platform: auto builds locally; pull mode fails clearly.
- Registry auth/network errors: distinguish from absence and apply selected mode.
- Revision-label mismatch: reject before restart.
- Dirty sources/submodule mismatch: reject publication and normal upgrade.
- Failed image preparation: current service and saved image selection unchanged.
- Persisted selection: fresh shell/systemd uses same digest; changing a tag cannot
  replace it; custom paths/volumes survive installation and upgrade.
- First install and upgrade: migrations and HTTP readiness succeed with a real
  prepared image. The no-build fast path is exercised with compilation forbidden.
- Explicit build mode and a custom frontend remain supported.
- Interrupted publication/selection does not leave a partially valid artifact.

## Rollout and completion evidence

Planning completed after reading the listed scripts. No publisher, registry push,
CI workflow or installation behavior is changed by this document.

Implementation handoff must record commands/tests, source SHA, published digest,
verified platforms, real-image smoke result, fallback behavior and remaining
limitations. Commit each implementation slice, open/update PRs, and leave merges
to the user. Publishing credentials are supplied by the operator’s local credential store.

## Implementation progress (#1340)

Publisher, prepared runtime, selection modes, persisted image state, systemd
integration, installer Compose-plugin update and local release instructions are
implemented. SHA tags are reused rather than rebuilt when already published;
version aliases require an exact matching Git tag/image. The release agent publishes locally; concurrent publishers must not race to create the same tag.
Operational tests cover pull/build fallback, immutable selection, dirty sources,
failed preparation and prepared-runtime build prohibition. Production linux/amd64 image builds, real API startup and loopback-registry
publication passed; evidence is recorded in `docs/implemented.md`. GHCR permissions
and a live Ubuntu/systemd installation remain operator validation.
