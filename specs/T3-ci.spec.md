# T3 — CI GitHub Actions + Dependabot (SEC-10) + phát hành 2.1.2

> **Failing test:** `specs/T3-ci.test.mjs`.
> **Nguồn:** `specs/ROADMAP-SEC.md` mục 3 (T3 + "Phát hành 2.1.2"). Làm **sau** T1 + T2 (trước đó `npm audit` còn cảnh
> báo → CI đỏ ngay).

## Vì sao (SEC-10)

Không có kiểm tự động: lỗ hổng mới công bố trong thư viện chỉ được phát hiện khi có người chạy `npm audit` bằng tay; harness
chỉ chạy trên máy người làm. CI chạy mỗi lần push / PR **và hằng tuần** (bắt lỗ hổng mới dù không ai push).

## PHẦN A — `.github/workflows/ci.yml`

- Trigger: `push` vào `main`, `pull_request`, `schedule` (thứ Hai 02:17 UTC).
- Quyền tối thiểu: `permissions: contents: read`; `actions/checkout` với `persist-credentials: false` (token không nằm lại
  trong `.git/config` cho các bước sau); `timeout-minutes: 15`. **Không** `pull_request_target`, không `secrets.*`.
- Chỉ action chính chủ `actions/*` (`checkout@v7`, `setup-node@v7` — đều chạy node24; Dependabot nâng tiếp).
- Bước, theo thứ tự: `npm ci` → `npm audit --omit=dev --audit-level=moderate` (bản đóng gói, chặn từ mức **vừa**) →
  `npm audit --audit-level=high` (công cụ build, chặn từ mức **cao**) → `cp .env.example .env && npm run build` (gồm
  `vue-tsc`; build trước vì vài harness đọc `dist/`) → mọi `specs/*.test.mjs` (in đầu ra của file FAIL trong nhóm log).
- Node 24 (LTS, như máy làm).

## PHẦN B — `.github/dependabot.yml`

- `npm` hằng tuần, tối đa 5 PR; nhóm `tiptap` (`@tiptap/*`) và `build-tools` (`vite`, `@vitejs/*`, `@crxjs/*`,
  `typescript`, `vue-tsc`).
- `github-actions` hằng tháng.

**Sir bật trên GitHub** (Settings › Code security): **Dependabot alerts** + **Dependabot security updates**; **Secret
scanning / Push protection** nếu gói cho phép.

**Quy tắc khi Dependabot mở PR:** đọc changelog; gói mới (chưa từng có) → hỏi lại; bản lớn → làm như T1 (chạy thử trước).

## PHẦN C — Phát hành 2.1.2

- `public/manifest.json` + `package.json` + lock (`version`, `packages[""].version`) = **2.1.2**; `DESIGN.md` `version:
  2.1.2`. Quyền không đổi → Chrome không tạm tắt extension khi cập nhật.
- README: `**Version:** 2.1.2`; mục **"What changed in 2.1.2"** (mục lục, trước 2.1.1): Tiptap 3, vite 6, CI + Dependabot,
  `npm audit` 0.
- Store (`docs/chrome-store-detailed-description.txt`): **WHAT'S NEW IN 2.1.2** — dòng mới "Security: editor and build
  libraries updated (no known vulnerabilities); automated security checks on every change" **đứng đầu**, giữ các dòng của
  2.1.0 / 2.1.1 (người cập nhật từ 2.0.1 vẫn thấy sao lưu ra file). `docs/CHROME-STORE-LISTING.md`: "Release 2.1.2
  (highlights)". `docs/CHROME-STORE-PERMISSIONS.md`: `**v2.1.2**` (quyền không đổi).

## PHẦN D — Test (`specs/T3-ci.test.mjs`)

| Ca | Kiểm |
|---|---|
| T3.1 | ci.yml: push main + pull_request + schedule cron |
| T3.2 | `permissions: contents: read`, `persist-credentials: false`, `timeout-minutes`; không `contents: write` / `pull_request_target` / `secrets.` |
| T3.3 | Đủ bước, đúng thứ tự: npm ci → audit moderate (omit dev) → audit high → cp .env.example → build → vòng `specs/*.test.mjs` + `exit $fail` |
| T3.4 | Mọi `uses:` là `actions/<tên>@v<số>` |
| T3.5 | dependabot: version 2, npm weekly + nhóm `'@tiptap/*'`, github-actions |
| T3.6–T3.8 | Phát hành 2.1.2 (như PHẦN C) |

## Đổi assertion có chủ đích

- `SEC1.14–SEC1.16`: phiên bản **hiện tại ≥ 2.1.1** theo manifest (thay cho cứng 2.1.1); phần lịch sử 2.1.1 (README
  "What changed in 2.1.1", "Release 2.1.1 (highlights)") kiểm như cũ — giống B1.30–B1.32 ở 2.1.1.

## KHÔNG được đổi

- Code ứng dụng, quyền manifest, CSP. CI **không** deploy, không ghi gì vào repo.

## Nghiệm thu

`node specs/T3-ci.test.mjs` PASS; mọi harness PASS; build OK. Sau khi push: tab **Actions** trên GitHub chạy xanh lần đầu
(Sir xem một lần); bật Dependabot alerts / security updates.
