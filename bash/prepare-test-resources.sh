#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESOURCES_DIR="$ROOT_DIR/test/resources"

mkdir -p "$RESOURCES_DIR"

if [[ ! -s "$RESOURCES_DIR/input-image.jpg" ]]; then
	ffmpeg -y -f lavfi -i "testsrc=size=640x360:rate=1" -frames:v 1 -q:v 2 "$RESOURCES_DIR/input-image.jpg" >/dev/null 2>&1
fi

if [[ ! -s "$RESOURCES_DIR/not-streamable-input-video.mp4" ]]; then
	ffmpeg -y \
		-f lavfi -i "testsrc=size=320x240:rate=24" \
		-f lavfi -i "sine=frequency=1000:sample_rate=44100" \
		-t 2 \
		-pix_fmt yuv420p \
		-c:v libx264 \
		-c:a aac \
		"$RESOURCES_DIR/not-streamable-input-video.mp4" >/dev/null 2>&1
fi

if [[ ! -s "$RESOURCES_DIR/streamable-input-video.mp4" ]]; then
	ffmpeg -y \
		-f lavfi -i "testsrc=size=320x240:rate=24" \
		-f lavfi -i "sine=frequency=800:sample_rate=44100" \
		-t 2 \
		-pix_fmt yuv420p \
		-c:v libx264 \
		-c:a aac \
		-movflags +faststart \
		"$RESOURCES_DIR/streamable-input-video.mp4" >/dev/null 2>&1
fi

if [[ ! -s "$RESOURCES_DIR/test-archive.zip" ]]; then
	tmp_dir="$(mktemp -d)"
	trap 'rm -rf "$tmp_dir"' EXIT
	printf 'Test\n' > "$tmp_dir/test.txt"
	printf 'Test2\n' > "$tmp_dir/test2.txt"
	(cd "$tmp_dir" && zip -q "$RESOURCES_DIR/test-archive.zip" test.txt test2.txt)
fi
