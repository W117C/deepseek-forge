#!/usr/bin/env bash
# 恢复 Registry 数据目录。
set -euo pipefail
TARBALL="${1:?用法: restore.sh <备份.tar.gz> <目标目录>}"
DST="${2:?用法: restore.sh <备份.tar.gz> <目标目录>}"
mkdir -p "$DST"
tar -xzf "$TARBALL" -C "$DST"
echo "已恢复：$DST"
