#!/usr/bin/env bash
# 契約ドリフト検査: 各スタックの proto が 正典(/proto) と一致するか。
# 言語固有 option(go_package 等)は無視して比較する = 契約(message/service/@annotation)の一致を保証。
# ドリフトがあれば非ゼロ終了(CI ゲート)。
set -euo pipefail
cd "$(dirname "$0")/.."

norm() { grep -v '^option ' "$1" | cat -s; }   # option 行を除去 + 連続空行を1行に

stacks=(manji-standard-server-go manji-standard-server-ts-hono manji-standard-server-ts-next manji-standard-server-python manji-standard-server-web)
rc=0
for rel in $(cd proto && find . -name '*.proto'); do
  canon="proto/$rel"
  for st in "${stacks[@]}"; do
    f="$st/proto/$rel"
    [ -f "$f" ] || { echo "MISSING  $f"; rc=1; continue; }
    if diff <(norm "$canon") <(norm "$f") >/dev/null; then
      echo "OK       $st/proto/$rel"
    else
      echo "DRIFT    $st/proto/$rel (契約が /proto と不一致)"; rc=1
    fi
  done
done
[ $rc -eq 0 ] && echo "contract unified across all stacks." || echo "contract drift detected."
exit $rc
