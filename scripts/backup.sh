#!/usr/bin/env bash
# 备份 Registry 数据目录（registry.json + artifacts/ + scan/）。
set -euo pipefail
SRC="${1:?用法: backup.sh <registry 数据目录> [备份目标目录]}"
DST="${2:-$(dirname "$SRC")/backups}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$DST/registry-$STAMP.tar.gz"
mkdir -p "$DST"
tar -czf "$OUT" -C "$SRC" .
echo "已备份：$OUT"
