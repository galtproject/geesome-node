#!/bin/bash
set -euo pipefail

# Compatibility entry point for existing server commands.
exec bash "$(dirname "${BASH_SOURCE[0]}")/docker-upgrade" "$@"
