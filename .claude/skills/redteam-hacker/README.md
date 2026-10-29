# redteam-hacker — skill rà soát bảo mật kiểu hacker (dùng cho mọi dự án)

Claude đóng vai kẻ tấn công 35+ năm kinh nghiệm: tự nhận stack, tìm đường tấn công theo checklist, xác minh bằng
file:dòng + PoC chạy cục bộ, xếp mức, viết báo cáo ưu tiên. **Chỉ rà soát + báo cáo** — không tự sửa khi chưa duyệt,
không tấn công hệ thống thật.

## Cài

| Muốn dùng ở | Làm |
|---|---|
| Mọi dự án trên máy (Claude Code) | `bash .claude/skills/redteam-hacker/scripts/install-global.sh` → chép vào `~/.claude/skills/` |
| Một repo khác (cả nhóm cùng dùng) | `bash .claude/skills/redteam-hacker/scripts/install-global.sh --to ../repo-khac` rồi commit `.claude/skills/redteam-hacker` |
| claude.ai (nếu tài khoản có mục Skills) | `… install-global.sh --zip` → tải `redteam-hacker.zip` lên Settings › Capabilities › Skills |
| Windows (PowerShell) | `Copy-Item -Recurse .claude\skills\redteam-hacker "$HOME\.claude\skills\"` |

Phiên Claude Code trên cloud: thư mục `~/.claude` mất khi phiên kết thúc → dùng bản trong repo (`.claude/skills/`).

## Dùng

- Gõ `/redteam-hacker`, hoặc nói: "đóng vai hacker tìm lỗ hổng", "red team dự án này", "rà soát bảo mật trước khi phát
  hành".
- Giới hạn để tiết kiệm: "red team chỉ luồng đăng nhập", "chỉ diff từ commit abc123".
- Lần đầu ở một dự án, skill tạo `REDTEAM-PROFILE.md` (hồ sơ: stack, cửa vào, phòng thủ, kịch bản PoC). Lần sau đọc hồ
  sơ là đủ → rẻ hơn nhiều.

## Bên trong

| File | Nội dung |
|---|---|
| `SKILL.md` | Vai trò, ranh giới, quy trình 7 bước, thang mức |
| `scripts/recon.sh` | Trinh sát tự động, **chỉ đọc**: nhận stack, bí mật (chỉ vị trí), XSS / thực thi / injection, xác thực, Supabase / Firebase, mật mã, chuỗi cung ứng, hạ tầng (~3 s) |
| `references/core-checklist.md` | 12 nhóm kiểm chung cho mọi dự án |
| `references/stacks/*.md` | Module theo stack: browser extension, web frontend, backend API, Supabase / Firebase, AI / LLM |
| `references/payloads.md` | Payload thử (XSS, URL, SQL / NoSQL, lệnh, SSRF, ICS / CSV, prototype, JWT, prompt injection) — chỉ `*.example` |
| `references/poc-browser.mjs` | PoC trình duyệt (web URL hoặc extension): đếm alert, request ra ngoài, vi phạm CSP, ô nhiễm prototype; thoát mã 1 khi có dấu hiệu bị khai thác |
| `references/report-template.md`, `profile-template.md` | Mẫu báo cáo và hồ sơ dự án |

Cần: `bash`, `grep`, `git`, Node ≥ 18 (cho `poc-browser.mjs` thêm Playwright + Chromium).
