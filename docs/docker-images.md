# Docker image publication and deployment

## Release publication

Images are addressed by the exact clean Git revision:
`ghcr.io/galtproject/geesome-node:sha-<40-character-commit>`.
The publisher labels each image with its revision/source and smoke-tests the real
prepared runtime against disposable PostgreSQL and Kubo services before pushing.
It never merges a PR or creates a Git release/tag.

1. Merge tested release code/metadata into master. Check out the exact resulting
   commit or its release tag, initialize submodules, and ensure the working tree
   is clean. A topic-branch image does not match the later master merge commit.
2. Authenticate to the registry. For manual GHCR publication use a credential
   with package publication rights; keep it in your credential manager/environment:

   ```bash
   printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
   ```

3. Build, smoke-test and publish (Docker with buildx/Compose plugin, Git and curl
   are required):

   ```bash
   GEESOME_PUBLISH_PLATFORM=linux/amd64 npm run docker-publish
   ```

4. To also publish the version alias, run from the exact Git release tag:

   ```bash
   GEESOME_RELEASE_TAG="$(git describe --tags --exact-match)" npm run docker-publish
   ```

   Existing SHA images are pulled, verified and reused instead of rebuilt. An
   existing version alias must identify the same image; it cannot silently move.
   The final command prints the immutable registry digest. Record it with the
   release evidence. No `latest` tag is used for deployment.

The default registry is configurable with `GEESOME_IMAGE_REPOSITORY`. Ensure the
package is publicly readable if unauthenticated installation is expected; otherwise
run `docker login` as the same server account that performs deployment. Missing
registry permission is not proof that a tag is absent: the publisher fails closed
on ambiguous inspection errors.

The trusted-branch/tag workflow `.github/workflows/docker-publish.yml` uses the
same script after operational and full backend tests. It publishes dev/master
commits and version tags with `GITHUB_TOKEN` package-write permission, and supports
manual dispatch. Forks are excluded. Configure repository/package permissions
before the first workflow run. Concurrent runs are serialized by Git revision.
An already published commit is reused for a release alias.

## Platforms and custom builds

The initial supported build platform is `linux/amd64`, including when publishing from an Apple
Silicon Mac through Docker emulation. A single invocation publishes one platform;
this is not a multiarchitecture index. The current base image is amd64-only;
the publisher and local-build fallback reject other platforms rather than label
an incompatible root filesystem as arm64. A server on another architecture can
only use a separately prepared matching image in pull mode until its base image
and native dependencies are verified and support is added.

Build inputs must be committed. Ordinary untracked files and modified submodules
are rejected. Build context is exported from Git (including committed submodules),
so ignored environment files, secrets and caches never enter the source snapshot.
Custom frontend code belongs in the built source/dependency revision. Prepared
runtime rejects missing/corrupt assets or incompatible build settings rather than
installing packages or recompiling. For deliberate source-based experiments only,
`GEESOME_FRONTEND_ALLOW_BUILD=1` in the container opts back into frontend building.

## Installation and upgrades

Existing commands remain:

```bash
sudo bash bash/ubuntu-install-docker.sh
npm run docker-upgrade
```

`GEESOME_IMAGE_MODE=auto` (default) pulls the exact SHA/platform and verifies the
revision label, or falls back to the existing server build. Registry absence,
platform absence and network/authentication errors are reported; auto mode falls
back for pull errors. A revision mismatch always aborts. `pull` requires a
published image; `build` forces a server build. Example:

```bash
GEESOME_IMAGE_MODE=pull npm run docker-upgrade
GEESOME_IMAGE_MODE=build npm run docker-upgrade
```

Preparation finishes before restart. Failed preparation preserves the current
service and selected image. The selected registry digest (or local image ID) is
stored atomically in ignored `.docker-deploy/image`; its predecessor is retained
in `previous-image` and protected by the local `geesome-node-rollback:previous`
tag from dangling-image pruning. Compose starts with `--no-build` and `pull_policy: never`.
The service launcher reads this state after a reboot as well. It does not change
user `.env` or persistent storage paths.

Use the deployment-aware wrapper for stack operations:

```bash
npm run docker-compose -- ps
npm run docker-compose -- logs -f web
npm run docker-compose -- up -d --no-build
```

Raw `docker compose` reads only the source Compose definition and can bypass the
selected image. Build scripts intentionally use that source definition. During
upgrade, existing systemd installations receive an image-selection drop-in so
they also use the wrapper. Keep the selected image on disk; a restart deliberately
does not contact a mutable registry tag or automatically rebuild a missing image.

## Recovery and validation

Keep database backups and the previous image. After investigating a failed runtime
upgrade, the previous image can be reselected by copying `previous-image` to
`image` and restarting the service. This only rolls back application code; it
never undoes migrations or restores the database. Confirm schema compatibility
or restore the corresponding database backup before relying on rollback.

Run `npm run test:docker-images`, `npm run test:docker-images:compose`, `npm run test:frontend-dist-publish`,
`npm run test:frontend-cache:docker`, and `npm run test:docker-retention` for
operational regressions. `bash bash/docker-image-smoke.sh IMAGE linux/amd64`
starts isolated services, checks `/v1/health`, then removes its own containers and
volumes. It does not operate on a deployed production stack.
