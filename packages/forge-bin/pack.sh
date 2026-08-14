#!/usr/bin/env bash
# 把 CI binaries job 的三平台制品打包进本目录（发布前执行）。
# 用法：bash pack.sh <ci-download-dir>
# 期望布局：<dir>/forge-core-linux/forge-core
#          <dir>/forge-core-darwin/forge-core
#          <dir>/forge-core-windows/forge-core.exe
set -euo pipefail
SRC="${1:?usage: pack.sh <ci-download-dir>}"
mkdir -p linux darwin windows
cp "${SRC}/forge-core-linux/forge-core" linux/forge-core
cp "${SRC}/forge-core-darwin/forge-core" darwin/forge-core
cp "${SRC}/forge-core-windows/forge-core.exe" windows/forge-core.exe
chmod +x linux/forge-core darwin/forge-core
echo "packed:"
ls -la linux darwin windows
