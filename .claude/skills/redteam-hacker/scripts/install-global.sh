#!/usr/bin/env bash
# Cài skill redteam-hacker cho MỌI dự án trên máy này (Claude Code đọc ~/.claude/skills/ ở mọi thư mục).
#   bash .claude/skills/redteam-hacker/scripts/install-global.sh          # cài / cập nhật bản dùng chung
#   bash .claude/skills/redteam-hacker/scripts/install-global.sh --zip    # tạo redteam-hacker.zip (tải lên claude.ai)
#   bash .claude/skills/redteam-hacker/scripts/install-global.sh --to <repo khác>   # chép vào .claude/skills của repo đó
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="$(basename "$SRC")"

case "${1:-}" in
  --zip)
    OUT="$(pwd)/$NAME.zip"
    (cd "$(dirname "$SRC")" && rm -f "$OUT" && zip -qr "$OUT" "$NAME" -x '*.DS_Store')
    echo "Đã tạo $OUT — claude.ai › Settings › Capabilities › Skills › Upload (nếu tài khoản có mục này)."
    ;;
  --to)
    DEST="${2:?Thiếu đường dẫn repo}/.claude/skills/$NAME"
    mkdir -p "$(dirname "$DEST")" && rm -rf "$DEST" && cp -R "$SRC" "$DEST"
    echo "Đã chép vào $DEST — commit thư mục này để cả nhóm dùng."
    ;;
  *)
    DEST="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/$NAME"
    mkdir -p "$(dirname "$DEST")" && rm -rf "$DEST" && cp -R "$SRC" "$DEST"
    chmod +x "$DEST/scripts/"*.sh
    echo "Đã cài vào $DEST — mở Claude Code ở dự án bất kỳ rồi gõ /$NAME (hoặc nói \"đóng vai hacker rà soát bảo mật\")."
    ;;
esac
