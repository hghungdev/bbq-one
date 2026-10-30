# ROADMAP-SEC — Kế hoạch bảo mật sau 2.1.1 (chi tiết, làm từng mục với chi phí thấp)

> **Sir yêu cầu (2026-10-29):** "Tổng hợp lại giúp mình vào trong plan chi tiết thật kỹ giúp mình vì $ mình gần hết rùi".
> Nguồn: `specs/SEC-REDTEAM-2026-10-29.md` (12 tình huống; SEC-1 phần vá, 4, 5, 6, 7, 8 đã xong ở **2.1.1**).
> Plan viết để **một phiên mới, kể cả model rẻ hơn (Sonnet / Cursor)**, làm được từng mục **không phải dò lại code**:
> mỗi mục có file:dòng, thiết kế, test cần viết, cách kiểm, rủi ro, công. Mục T1 / T2 **đã chạy thử thật** trên bản sao
> (không commit) — kết quả ghi bên dưới.

## 0. Tóm tắt một trang

| Đợt | Mục | Việc | Công | Rủi ro | Sir chốt trước? |
|---|---|---|---|---|---|
| **Ngay** (không code) | A1–A4 | Deploy Edge Function, upload 2.1.1, cấu hình Supabase (SEC-2 phần cấu hình), xóa nhánh | — | Thấp | Không |
| **2.1.2** Thư viện sạch | T1 | Tiptap 2.27.3 → **3.32.1** (SEC-1 phần 2) — **chạy thử: chỉ sửa 2 dòng + 3 tùy chọn** | S | Thấp–vừa | Không |
| | T2 | vite 5.4.21 → **6.4.5** (lỗ hổng máy chủ dev) — **chạy thử: không sửa code** | XS | Thấp | Không |
| | T3 | CI GitHub Actions + Dependabot (SEC-10) | S | Thấp | Không |
| **2.2.0** Thao tác an toàn | S11 | "Xóa tất cả bookmark": tự sao lưu trước + gõ chữ xác nhận (SEC-11) | S | Thấp | Không |
| | S12 | Gợi ý thanh địa chỉ: chế độ Đầy đủ / Chỉ tên / Tắt (SEC-12) | S | Thấp | **Có** — mặc định |
| | S9 | PBKDF2 600.000 vòng cho thư mục bảo mật + chặn khóa cũ sau khi đổi mật khẩu (SEC-9) | M | Vừa | Không |
| **2.3.0** 2FA | S2 | Xác thực 2 bước TOTP + RLS bắt buộc `aal2` (SEC-2 phần code) | M | Vừa | **Có** — bắt buộc / tùy chọn |
| **2.4.0** Sao lưu mã hóa | S3 | File sao lưu mã hóa bằng mật khẩu, tự sao lưu không cần hỏi mật khẩu (SEC-3a) | M | Vừa | **Có** — bật mặc định? |
| Để sau | — | Mã hóa toàn kho máy (SEC-3c), vite 8 / crxjs 3 | L | Cao | — |

Sau **2.1.2**: `npm audit` = **0 lỗ hổng** (cả bản đóng gói lẫn công cụ build) — đã đo trên bản chạy thử.

**Vì sao Tiptap 3 chỉ là 2.1.2 (số cuối):** quy ước của Sir — "refactor / nâng cấp lớn **ảnh hưởng nhiều** → tăng số đầu".
Chạy thử cho thấy người dùng không thấy gì khác (schema ghi chú y hệt, dữ liệu không đổi), code đổi 2 dòng → không
"ảnh hưởng nhiều". Sir muốn theo nghĩa chặt (đổi bản lớn thư viện = 3.0.0) thì chỉ cần đổi số, plan giữ nguyên.

## 1. Cách dùng plan này để tốn ít tiền nhất

1. **Một mục (hoặc một đợt) một phiên.** Dán prompt mẫu ở mục 9 — đã chỉ rõ file cần đọc, không để model tự dò.
2. **Model rẻ cho phần code**, model mạnh chỉ cho phần nhạy cảm: T1 / T2 / T3 / S11 / S12 → Sonnet là đủ; S9 / S2 / S3
   (mật mã, đăng nhập) → nên để Opus **review** diff sau khi Sonnet viết (hoặc chạy skill `/redteam-hacker` trên diff).
3. Quy trình giữ như cũ: `specs/<ID>-<slug>.spec.md` + `specs/<ID>-<slug>.test.mjs` → commit `docs(<ID>): spec + failing
   test` (RED) → code → commit `feat/fix(<ID>): …` (GREEN) → thêm dòng vào bảng Trạng thái cuối file này.
4. Làm thẳng trên `main` (Sir, từ U36). Assertion cũ đổi có chủ đích thì ghi "(đổi có chủ đích)".
5. **Mỗi đợt kết thúc bằng một bản phát hành** (mục 8 checklist) — đừng gom nhiều đợt vào một bản: dễ khoanh lỗi.

---

## 2. Việc Sir làm ngay (không tốn tiền code)

### A1 — Deploy lại Edge Function lịch (bắt buộc cho SEC-8 của 2.1.1)

```bash
supabase functions deploy calendar-feed --no-verify-jwt
```

Kiểm: mở link Google Calendar cũ (Cài đặt › Lịch) vẫn tải được `.ics`.

### A2 — Phát hành 2.1.1

`main` đang là 2.1.1 (`0c6a014`). Build bằng `.env` thật → zip `dist/` → upload Store. Mục WHAT'S NEW 2.1.1 đã gồm cả sao
lưu ra file của 2.1.0. Quyền không đổi → Chrome không tạm tắt extension khi cập nhật.

### A3 — Cấu hình Supabase dashboard (SEC-2 phần cấu hình — miễn phí, làm ngay)

Tên menu có thể lệch đôi chút theo phiên bản dashboard; tìm theo từ khóa.

| Ở đâu (Authentication › …) | Đặt | Vì sao |
|---|---|---|
| Sign In / Providers › Email › **Minimum password length** | **10** (hoặc 12) | Chống đoán mật khẩu ngắn |
| Cùng chỗ › **Password requirements** | Chữ thường + chữ hoa + số | Như trên |
| Cùng chỗ › **Secure email change** | **Bật** | Đổi email phải xác nhận ở cả email cũ |
| Cùng chỗ › **Secure password change** (nếu có) | **Bật** | Đổi mật khẩu cần đăng nhập gần đây |
| **Leaked password protection** (HaveIBeenPwned) | Bật **nếu gói cho phép** (thường cần gói Pro) | Chặn mật khẩu đã lộ ở vụ khác |
| **Rate Limits** › sign-in / sign-up | Hạ xuống ~**30 / 5 phút / IP** | Chống dò mật khẩu hàng loạt |
| **Multi-Factor** › TOTP | **Bật** (thường bật sẵn) | Cần cho 2.3.0 |
| **URL Configuration** › Redirect URLs | Chỉ giữ URL thật đang dùng, **bỏ `*`** | Chống chuyển hướng token sang trang lạ |
| ⚠ **CAPTCHA** (hCaptcha / Turnstile) | **KHÔNG bật** | MV3 cấm tải script từ ngoài → bật là **không ai đăng nhập được** từ extension |

Thêm: dashboard › **Advisors › Security Advisor** → chạy, chụp kết quả gửi phiên sau nếu có cảnh báo.

### A4 — Dọn nhánh (proxy chặn Claude xóa)

Xóa tay trên GitHub: `claude/fervent-hamilton-neiff5`, `claude/dazzling-wright-m0fqb2`, `claude/ui-adn-redesign`,
`claude/ui-nav-rail`. **`20260418_backup` còn 12 commit chưa có trên `main`** — xem trước rồi mới quyết.

---

## 3. Bản 2.1.2 — Thư viện sạch (T1 + T2 + T3)

### T1 — Tiptap 2.27.3 → 3.32.1 (SEC-1 phần 2: GHSA-cp6q-959q-f8rh, 24 cảnh báo vừa)

**Đã chạy thử (2026-10-29, bản sao repo trong scratch, không commit):**

| Kiểm | Kết quả |
|---|---|
| `npm audit --omit=dev` | **found 0 vulnerabilities** (trước: 24 vừa) |
| `vue-tsc` | 2 lỗi, đều là `setContent(…, false)` → sửa xong sạch |
| Schema ghi chú (`getSchema`) | StarterKit 3 **thêm mark `link` + `underline`** → tắt đi thì **y hệt 2.x**: nodes `paragraph, blockquote, bulletList, codeBlock, doc, hardBreak, heading, horizontalRule, listItem, orderedList, text`; marks `bold, code, italic, strike` |
| 85 harness | 84 PASS; **SEC1.1** FAIL vì `markdown-it` / `linkify-it` **không còn trong cây** (Tiptap 3 bỏ) → đổi assertion có chủ đích |
| Build | OK; JS tổng 2.635.271 → 2.728.288 byte (**+93 KB, +3,5 %**) — thêm `@floating-ui/*`, bỏ `@popperjs/core`, `markdown-it`, `linkify-it` |
| Chromium (script SEC1) | Font, logo, Shiki tô màu (9 span), dán HTML có `<img>` / `<iframe>` → chỉ còn chữ, khôi phục bookmark lọc link, xuất HTML escape, B1 xem trước, **0 vi phạm CSP, 0 request ra ngoài, 0 lỗi console** |
| Chromium (trình soạn, so 2.x vs 3.x) | Gõ chữ, Ctrl+B, danh sách `- `, khối code ```` ``` ````, tự lưu sau 2 s: **giống nhau**. Mở ghi chú kết thúc bằng khối code → **không tự lưu** (nhờ tắt `trailingNode`). Khác duy nhất: **Ctrl+Z ngay sau khi gõ ```` ``` ```` + cách** → 3.x trả lại chữ ```` ``` ```` (hoàn tác quy tắc gõ tắt), 2.x xóa luôn khối. Chấp nhận được (đúng chuẩn ProseMirror) |

**Các bước (copy làm theo):**

1. Cài (gỡ trước để lock không giữ gói 2.x — cài đè thẳng sẽ lỗi `ERESOLVE`):
   ```bash
   npm uninstall @tiptap/starter-kit @tiptap/vue-3
   ```
   ```bash
   npm install @tiptap/starter-kit@^3.32.1 @tiptap/vue-3@^3.32.1 @tiptap/core@^3.32.1 @tiptap/pm@^3.32.1
   ```
   Khai thẳng `@tiptap/core` + `@tiptap/pm` vì code import trực tiếp (`noteHtmlSanitize.ts`, `NoteEditor.vue`);
   `@floating-ui/dom` tự cài theo peer của `@tiptap/vue-3` (BBQOne không dùng BubbleMenu / FloatingMenu).
2. `src/components/notes/NoteEditor.vue` dòng **124** và **132**:
   ```ts
   ed.commands.setContent('<p></p>', { emitUpdate: false })
   ed.commands.setContent(content || '<p></p>', { emitUpdate: false })
   ```
   (Tiptap 3 đổi tham số thứ 2 thành object. **Bắt buộc giữ `emitUpdate: false`** — mặc định của 3.x là phát update →
   mở ghi chú nào cũng bị coi là sửa → tự lưu + đồng bộ thừa.)
3. `src/utils/noteEditorExtensions.ts` — trong `StarterKit.configure({ … })` thêm:
   ```ts
   // Tiptap 3: StarterKit thêm sẵn link / underline / trailingNode — tắt để schema giữ y như 2.x.
   link: false,
   underline: false,
   trailingNode: false,
   ```
   **Lý do bảo mật:** bật `link` thì `<a href>` từ dán / đồng bộ / file sao lưu **sống sót qua bộ lọc B1**
   (`noteHtmlSanitize.ts` dùng chung schema) → mở thêm đường lừa đảo bằng link. Muốn có link sau này = mục riêng, có
   danh sách trắng scheme + `rel="noopener noreferrer"`.
4. Bỏ import "ma" (gói không khai trong `package.json`, đang dùng nhờ cài kèm): đổi sang `@tiptap/pm/*` để chắc chắn dùng
   **cùng một bản** ProseMirror với Tiptap (hai bản khác nhau → `instanceof` sai → dán lỗi âm thầm):
   - `src/components/notes/NoteEditor.vue:17` → `import type { EditorView } from '@tiptap/pm/view'`
   - `src/utils/pastePlainText.ts:1` → `import { DOMParser as PMDOMParser } from '@tiptap/pm/model'`
   - `src/utils/pastePlainText.ts:2` → `import type { EditorView } from '@tiptap/pm/view'`
   - Hiện không harness nào import thật `pastePlainText.ts` (SEC1 chỉ đọc mã nguồn) → nếu harness nào báo
     `Unmocked import … @tiptap/pm/…` thì thêm mock theo mẫu sẵn trong chính file đó (chỉ vá mock, **không** đổi
     assertion). Đã chạy thử bước 4: `vue-tsc` sạch, harness như trên (chỉ SEC1.1), build OK, Chromium dán OK.
5. `specs/SEC1-hardening-2.1.1.test.mjs` SEC1.1 — **(đổi có chủ đích)**: gói không còn trong lock = đạt (`markdown-it`,
   `linkify-it`); gói còn thì vẫn phải ≥ bản vá.

**Test mới `specs/T1-tiptap-v3.test.mjs`** (harness Node như mọi test khác):
- T1.1 `package.json` khai `@tiptap/core`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/vue-3` ở `^3.32.1`; mọi
  `node_modules/@tiptap/*` trong lock **cùng một bản** ≥ 3.32.1.
- T1.2 Schema thật: import `@tiptap/core` `getSchema` + `noteEditorExtensions()` (transpile TS) → nodes / marks **đúng
  bằng** danh sách ở bảng trên (không `link`, không `underline`). Đây là chốt chặn quan trọng nhất.
- T1.3 Không còn `setContent(…, false)` / `clearContent(false)` trong `src/` (regex); có `emitUpdate: false`.
- T1.4 Không còn `from 'prosemirror-` trong `src/` (chỉ `@tiptap/pm/*`).
- T1.5 `sanitizeNoteHtml('<p><a href="javascript:alert(1)">x</a><u>y</u></p>')` → không còn `<a` / `<u` (chữ giữ lại).

**Kiểm tay / Chromium** (PoC hồi quy: lệnh trong `specs/REDTEAM-PROFILE.md` › Kịch bản PoC): mở ghi chú cũ có code
SQL, gõ, Ctrl+B, danh sách, khối code, Ctrl+Z / Ctrl+Shift+Z, dán từ trang web (có ảnh), dán code từ VS Code (giữ thụt
lề), sao chép ghi chú (F1 Alt+Enter), thư mục bảo mật mở / sửa / khóa, đo mở popup (mốc P5: tới lịch ~505–559 ms —
chấp nhận nếu chậm < 10 %).

**Rủi ro / quay lui:** HTML ghi chú không đổi định dạng → revert commit là về 2.x an toàn, dữ liệu hai chiều đọc được.
**Công:** S (~0,5 ngày gồm kiểm).

### T2 — vite 5.4.21 → 6.4.5 (lỗ hổng máy chủ dev: vite ≤ 6.4.3 cao, esbuild ≤ 0.24.2 vừa)

**Đã chạy thử:** `npm install -D vite@^6.4.5` → esbuild 0.25.12; `npm audit` còn đúng 24 cảnh báo Tiptap (vite / esbuild
hết); build OK, **danh sách file `dist/` y hệt**; 85/85 harness PASS; `vue-tsc` sạch; Chromium script SEC1 PASS.
`@crxjs/vite-plugin` 2.7.1 và `@vitejs/plugin-vue` 5.2.4 đều nhận vite 6 → **không sửa code**.

```bash
npm install -D vite@^6.4.5
```

Chưa thử: `npm run dev` (HMR của crxjs) — Sir chạy thử một lần. **Không nhảy thẳng vite 8** (đổi lớn, cần plugin-vue /
crxjs mới) — để sau. Test: thêm vào T1 test ca **T1.6** `package.json` vite ≥ 6.4.4, lock esbuild ≥ 0.25.0. **Công:** XS.

### T3 — CI GitHub Actions + Dependabot (SEC-10)

**Làm SAU T1 + T2** (trước đó `npm audit` còn cảnh báo → CI đỏ ngay).

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: '17 2 * * 1' # thứ Hai hằng tuần: bắt lỗ hổng mới công bố dù không ai push
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Lỗ hổng — bản đóng gói (chặn từ mức vừa)
        run: npm audit --omit=dev --audit-level=moderate
      - name: Lỗ hổng — công cụ build (chặn từ mức cao)
        run: npm audit --audit-level=high
      - name: Build (gồm vue-tsc)
        run: cp .env.example .env && npm run build
      - name: Test harness (specs/*.test.mjs)
        run: |
          fail=0
          for f in specs/*.test.mjs; do node "$f" > /dev/null 2>&1 || { echo "FAIL $f"; fail=1; }; done
          exit $fail
```

`.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    groups:
      tiptap:
        patterns: ['@tiptap/*']
      build-tools:
        patterns: ['vite', '@vitejs/*', '@crxjs/*', 'typescript', 'vue-tsc']
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: monthly
```

Sir bật trên GitHub (Settings › Code security): **Dependabot alerts** + **Dependabot security updates**; **Secret
scanning / Push protection** nếu gói cho phép. Chi phí: repo riêng tư có 2.000 phút Actions miễn phí / tháng; mỗi lần
chạy ~3–4 phút → thoải mái.

**Quy tắc khi Dependabot mở PR:** đọc changelog; gói mới (chưa từng có) → hỏi lại; bản lớn → làm như T1 (chạy thử trước).
**Test `specs/T3-ci.test.mjs`:** file tồn tại; có `npm ci`, `npm audit --omit=dev`, vòng `specs/*.test.mjs`, `npm run
build`, `permissions: contents: read`; dependabot có `npm` + `github-actions`. **Công:** S.

### Phát hành 2.1.2

`package.json` → 2.1.2 rồi `npm run sync-version` (manifest + lock); `DESIGN.md` version; README "What changed in
2.1.2" + mục lục; Store: "Release 2.1.2 (highlights)" + WHAT'S NEW IN 2.1.2 (một dòng: "Security: editor and build
libraries updated; automated security checks"); permissions doc `**v2.1.2**` (quyền không đổi). **SEC1.14–SEC1.16**
đang cứng 2.1.1 → đổi có chủ đích sang "phiên bản hiện tại ≥ 2.1.1" (làm như B1.30–B1.32 ở 2.1.1).

---

## 4. Bản 2.2.0 — Thao tác an toàn (S11 + S12 + S9)

### S11 — "Xóa tất cả bookmark" quá dễ (SEC-11)

**Hiện tại:** nút 🗑 (`BookmarkTab.vue` ~dòng 286–289) → `RetroConfirm` một nút (`BookmarkTab.vue` ~377–381) →
`onDeleteAllConfirm` (`BookmarkTab.vue:133`) → `bm.deleteAllFromBrowser` (`stores/bookmarks.ts:194`) →
`bookmarksService.deleteAllFromBrowser` (`services/bookmarks.service.ts:105`) → xóa sạch con của Bookmarks bar / Other /
Mobile. **Không hoàn tác được** (Chrome không có thùng rác bookmark).

**Thiết kế:**
1. **Tự sao lưu trước khi xóa:** `onDeleteAllConfirm` gọi `await bm.backup(buildBookmarkBackupLabel('before-delete'))`
   **trước**; lỗi → dừng, báo "Không tạo được bản sao lưu — chưa xóa gì". Thêm `'before-delete'` vào
   `BookmarkBackupLabelSource` (`utils/bookmarkBackupLabel.ts:2`).
2. **Gõ chữ xác nhận:** `RetroConfirm` `variant="danger"`, `confirm-label` "Xóa tất cả"; slot có ô nhập "Gõ **XOA** để
   xác nhận" (vi; nhận `XOA` / `XÓA`, không phân biệt hoa thường, bỏ khoảng trắng) / "Type **DELETE** to confirm" (en).
   Nút xác nhận **khóa** tới khi gõ đúng → thêm prop `confirmDisabled?: boolean` vào `components/ui/RetroConfirm.vue`
   (props ở dòng 7–15; nút ở ~dòng 134). Đóng hộp → xóa chữ đã gõ. Esc / ✕ giữ như U31.
3. **Sau khi xóa:** toast "Đã xóa N bookmark · đã lưu bản sao 'before-delete_…' — bấm ↶ ở bản đó để khôi phục"
   (đếm N trước khi xóa).
4. i18n (vi + en): `bookmark.deleteAllTypeHint`, `bookmark.deleteAllWord`, `bookmark.deleteAllBackupFailed`,
   `bookmark.deleteAllDone`.

**Test `specs/S11-delete-all-guard.test.mjs`:** S11.1 `bm.backup` chạy **trước** `deleteAllFromBrowser` (ghi thứ tự);
S11.2 backup lỗi → không gọi xóa; S11.3 nút khóa tới khi gõ đúng (vi `xoa` / `XÓA`, en `delete`), gõ sai vẫn khóa;
S11.4 nhãn `before-delete_YYYY-MM-DD_HH-mm`; S11.5 i18n đủ hai thứ tiếng; S11.6 hộp khôi phục (SEC1.6) không đổi.
**Chromium:** tạo 3 bookmark → xóa tất cả → danh sách bản sao lưu +1, cây Chrome trống → khôi phục bản đó → đủ 3.
**Công:** S.

### S12 — Gợi ý thanh địa chỉ lộ nội dung (SEC-12)

**Hiện tại:** `background.ts:301–323` (`chrome.omnibox.onInputChanged`) → `omniboxDescription`
(`utils/omniboxNotes.ts:155`) hiện `Tên — Thư mục · …đoạn trích…`; đoạn trích từ `snippetAround`
(`omniboxNotes.ts:78`); thư mục bảo mật + ghi chú mã hóa đã bị loại (`omniboxNotes.ts:100,109`). Nguy cơ: chia sẻ màn
hình / quay phim lúc gõ `bbq …` → lộ đoạn ghi chú.

**Thiết kế:**
1. Khóa `bbqone_omnibox_mode` (`chrome.storage.local`, thêm vào `constants/storage.ts`): `'full' | 'title' | 'off'`.
2. Cài đặt › mục "Tìm từ thanh địa chỉ (bbq)": 3 lựa chọn (radio): **Tên + đoạn trích** / **Chỉ tên** / **Tắt**.
3. `background.ts`: đọc mode cùng lượt `chrome.storage.local.get` đang đọc ngôn ngữ (~dòng 239–268, chỗ `lang:`).
   - `'title'` → `omniboxDescription` bỏ `hit.snippet` (vẫn tìm cả nội dung, chỉ không **hiện**).
   - `'off'` → `suggest([])`, `setDefaultSuggestion` = "BBQOne: tìm từ thanh địa chỉ đang tắt — bật trong Cài đặt";
     `onInputEntered` mở BBQOne **không** kèm chữ đã gõ.
4. Ghi trong Cài đặt: "Chrome có thể nhớ chữ bạn gõ trên thanh địa chỉ trong lịch sử — đó là của Chrome, BBQOne không
   xóa được."

**❓ Sir chốt mặc định:** đề xuất **"Chỉ tên"** (an toàn hơn; F1 trước đây hiện đoạn trích — người cũ sẽ thấy gợi ý
gọn hơn). Hay giữ **"Tên + đoạn trích"** như F1?
**Test `specs/S12-omnibox-privacy.test.mjs`:** mode `title` → description không chứa đoạn trích; `off` → không gợi ý +
dòng mặc định đúng; `full` → như F1 (test F1 cũ PASS nguyên); thư mục bảo mật vẫn loại ở mọi mode; i18n; mode lạ trong
kho → về mặc định. **Công:** S.

### S9 — PBKDF2 600.000 vòng cho thư mục bảo mật (SEC-9)

**Hiện tại:** `utils/secureCrypto.ts:3` `DEFAULT_PBKDF2_ITERATIONS = 310_000`; mỗi thư mục lưu `pbkdf2_iterations`
(`types/index.ts:37`) → mở khóa đọc đúng số vòng của thư mục (`stores/secureFolder.ts` ~dòng 62–66) → **tương thích ngược
sẵn**. Khóa dẫn **thẳng** từ mật khẩu (không có DEK bọc) → đổi số vòng = mã hóa lại mọi ghi chú trong thư mục — việc
`changePassphrase` (`secureFolder.ts` ~dòng 206–305) đã làm, rồi ghi `pbkdf2_iterations: DEFAULT…`. Tài khoản mã hóa
(`utils/accountCrypto.ts:6`) đã 600.000.

**⚠ Lỗi tiềm ẩn phải vá CÙNG lúc (tìm ra khi lập plan):** máy A đổi mật khẩu thư mục (salt mới) trong khi máy B đang mở
khóa bằng khóa cũ trong RAM. Không chỗ nào so salt khi đồng bộ về (`forgetFolderKey` chỉ gọi khi khóa tay —
`components/layout/Sidebar.vue:119`) → máy B sửa ghi chú sẽ **mã hóa bằng khóa cũ** → với mật khẩu mới **không đọc được
nữa** (mất dữ liệu). Nâng số vòng = thêm một đường đổi salt → phải có chốt này trước.

**Thiết kế:**
1. `DEFAULT_PBKDF2_ITERATIONS = 600_000` (thư mục mới + mỗi lần đổi mật khẩu). Thư mục cũ vẫn mở bằng 310.000.
2. **Chốt salt:** store `secureFolder` lưu kèm khóa: `{ key, saltB64 }`. (a) Khi folders store nhận bản thư mục có
   `secure_salt` khác salt của khóa đang giữ → `forgetFolderKey(id)` + thư mục về trạng thái khóa + toast "Mật khẩu thư
   mục đã đổi trên máy khác — mở khóa lại". (b) Trước khi mã hóa để ghi (title / body) → so lại salt; lệch → **không
   ghi**, khóa thư mục, báo như trên.
3. **Nâng cấp thư mục cũ — do Sir bấm, không tự động:** mở khóa xong mà `pbkdf2_iterations < DEFAULT` → dải nhỏ trong
   thư mục: "Thư mục này dùng mức bảo vệ cũ — **Nâng cấp**". Bấm → hỏi lại mật khẩu (không giữ mật khẩu trong RAM) →
   `changePassphrase(folderId, pw, pw)` → xong báo "Đã nâng cấp". Không tự động vì (2) cần có mặt trên mọi máy trước.
4. **Độ mạnh mật khẩu** khi tạo / đổi: tối thiểu 10 ký tự; chặn danh sách ~100 mật khẩu phổ biến (`123456789`,
   `password`, `matkhau`, `qwerty`, `iloveyou`, `abc123456`, ngày sinh dạng `01011990`…) để trong
   `utils/passwordStrength.ts` (không thêm thư viện — zxcvbn nặng ~800 KB); thanh mạnh / yếu đơn giản.
5. Đo trên Chromium: mở khóa 600.000 vòng (kỳ vọng ~0,3–0,8 s trên laptop) — hiện "Đang mở khóa…" nếu > 200 ms.

**Test `specs/S9-pbkdf2-600k.test.mjs`:** DEFAULT = 600.000; thư mục 310.000 vẫn mở được (gọi `deriveKeyFromPassword` với
số vòng của thư mục); tạo mới / đổi mật khẩu ghi 600.000; **salt lệch → khóa bị quên + không ghi** (mô phỏng 2 máy);
nâng cấp chỉ chạy khi bấm + hỏi mật khẩu; mật khẩu yếu bị chặn (vi + en); B1 nạp file `pbkdf2_iterations` 600.000 hợp lệ
(`PBKDF2_MAX` 5.000.000 — `utils/backupFile.ts:175`). **Chromium 2 ngữ cảnh** (2 tab cùng profile mô phỏng 2 máy qua
kho chung): tab A đổi mật khẩu → tab B đang mở khóa → B bị khóa lại, không ghi được bằng khóa cũ. **Công:** M.

### Phát hành 2.2.0

Như mục 8; README / Store: "Safer bookmark wipe (auto-backup + type to confirm), address-bar privacy modes, stronger
secure-folder protection".

---

## 5. Bản 2.3.0 — Xác thực 2 bước TOTP (SEC-2 phần code)

**Cần trước:** A3 (TOTP bật trong dashboard). `@supabase/supabase-js` 2.103.2 đã có `supabase.auth.mfa`:
`enroll({ factorType: 'totp', friendlyName })` → `{ id, totp: { qr_code, secret, uri } }`; `challenge({ factorId })`;
`verify({ factorId, challengeId, code })`; `challengeAndVerify({ factorId, code })`; `listFactors()`;
`unenroll({ factorId })`; `getAuthenticatorAssuranceLevel()` → `{ currentLevel, nextLevel }`.

**❓ Sir chốt:** 2FA **tùy chọn** (đề xuất — người dùng tự bật) hay **bắt buộc** với mọi tài khoản?

**Thiết kế:**
1. **Bật 2FA** — Cài đặt › Tài khoản › "Xác thực 2 bước": Bật → hộp hiện mã QR (`<img :src="qr_code">` — `qr_code` là
   `data:image/svg+xml…`, CSP `img-src 'self' data:` cho phép) + chuỗi bí mật (nút sao chép) → ô 6 số → `verify` → xong.
   Khuyên thêm **thiết bị thứ hai** (Supabase cho nhiều factor; **không có mã khôi phục**). Mất điện thoại → Sir (admin)
   xóa factor ở dashboard › Authentication › Users › người dùng › MFA — ghi rõ trong hộp.
2. **Đăng nhập:** sau `signInWithPassword` thành công (`services/auth.service.ts:22`) → `getAuthenticatorAssuranceLevel()`;
   `nextLevel === 'aal2' && currentLevel === 'aal1'` → bước "Nhập mã 6 số" → `challengeAndVerify`. **Chưa qua bước này
   thì chưa coi là đăng nhập:** auth store thêm trạng thái `needsMfa`; `isAuthenticated` = có phiên **và** không
   `needsMfa` → đồng bộ / service worker không chạy với phiên `aal1`.
3. **⚠ Đổi mật khẩu** (`auth.service.ts:51–69`) đang gọi lại `signInWithPassword` để kiểm mật khẩu cũ → tạo phiên **mới
   `aal1`** → mọi request sau đó bị RLS (bước 4) chặn. Phải hỏi lại mã 6 số ngay sau bước kiểm đó (hoặc dùng
   `supabase.auth.reauthenticate()` thay cho đăng nhập lại).
4. **Chặn ở máy chủ (bắt buộc — không có thì 2FA vô nghĩa):** kẻ có mật khẩu gọi thẳng REST API bằng phiên `aal1`, bỏ qua
   màn hình 2FA. Migration `supabase/migrations/019_mfa_enforce.sql` — policy **restrictive** cho **mọi bảng có
   `user_id`** (`folders`, `notes`, `note_bodies`, `bookmark_backups`, `calendar_events`, `calendar_feeds`, `user_crypto`,
   và bảng dịch / từ điển nếu còn — kiểm bằng truy vấn cuối khối):
   ```sql
   do $$
   declare t text;
   begin
     foreach t in array array['folders','notes','note_bodies','bookmark_backups','calendar_events','calendar_feeds','user_crypto']
     loop
       execute format($p$
         create policy "mfa_aal2_if_enrolled" on public.%I
           as restrictive for all to authenticated
           using (
             array[(select auth.jwt()->>'aal')] <@ (
               select case when count(id) > 0 then array['aal2'] else array['aal1','aal2'] end
               from auth.mfa_factors
               where (select auth.uid()) = user_id and status = 'verified'
             )
           )
       $p$, t);
     end loop;
   end $$;
   -- Kiểm còn sót bảng nào có user_id:
   -- select table_name from information_schema.columns where table_schema = 'public' and column_name = 'user_id';
   ```
   Các RPC `bbq_update_*_if_current` (`migrations/014_optimistic_update_guard.sql`) là **`SECURITY INVOKER`** → policy
   trên áp luôn, không cần sửa. Edge Function `calendar-feed` dùng token riêng (chỉ đọc lịch) → không đổi.
5. **Tắt 2FA** cần phiên `aal2` (Supabase tự đòi) → hỏi mã trước khi `unenroll`.

**Test `specs/S2-mfa-totp.test.mjs`:** đăng nhập có factor → `needsMfa`, chưa đồng bộ; mã đúng → vào; mã sai → báo,
vẫn chặn; không factor → như cũ; đổi mật khẩu → hỏi lại mã; migration có policy restrictive cho đủ 7 bảng + đúng mẫu
`aal`; i18n. **Kiểm thật:** bật 2FA bằng Google Authenticator; đăng xuất / vào lại; **gọi REST bằng access token
`aal1`** (curl như `SECURITY.md` › Kiểm tra RLS) → **0 dòng**; token `aal2` → đủ dữ liệu. **Công:** M (~1,5–2 ngày).
**Rủi ro:** khóa người dùng khỏi tài khoản khi mất điện thoại → hướng dẫn rõ + Sir xóa factor được.

---

## 6. Bản 2.4.0 — File sao lưu mã hóa (SEC-3a)

**Vấn đề:** file tự sao lưu B1 (`Tải xuống/BBQOne/bbqone-auto-<thứ>.json`) là chữ thường; nhiều máy đồng bộ thư mục Tải
xuống lên OneDrive / Google Drive; mã độc đánh cắp file nhắm vào đó.

**Khó:** tự sao lưu chạy lúc mở popup — **không thể hỏi mật khẩu mỗi lần**, mà giữ khóa trong kho máy thì kẻ trộm lấy
luôn khóa. **Giải pháp: mã hóa khóa công khai (ECIES, WebCrypto sẵn có, không thêm thư viện):**
- Bật "Mã hóa file sao lưu" → đặt mật khẩu sao lưu (2 lần, dùng `passwordStrength` của S9) → tạo cặp khóa **ECDH P-256**.
  Khóa **công khai** lưu thường (lộ không sao). Khóa **bí mật** mã hóa bằng AES-GCM, khóa dẫn từ PBKDF2-SHA256 600.000
  vòng (mật khẩu + salt 16 byte) → lưu `bbqone_backup_crypto` = `{ v:1, publicJwk, encPrivate: { salt, iterations, iv,
  ct } }`.
- Mỗi lần sao lưu (tay / tự động): sinh cặp khóa tạm → ECDH với khóa công khai → `deriveKey` AES-GCM 256 → nén
  `CompressionStream('gzip')` → mã hóa (IV 12 byte ngẫu nhiên). **Không cần mật khẩu.**
- File: `{ "app":"bbqone", "format":2, "exported_at", "app_version", "enc": { "alg":"ECDH-ES+A256GCM", "epk":<JWK>,
  "iv", "recipient": <bản sao encPrivate> }, "ct": <base64> }` — mang theo `recipient` nên **khôi phục ở máy khác chỉ cần
  file + mật khẩu**. Không ghi `counts` (lộ quy mô dữ liệu).
- Khôi phục: `format: 2` → hỏi mật khẩu → giải khóa bí mật → ECDH → giải mã → giải nén **có trần** (đếm byte khi đọc
  stream, vượt `BACKUP_MAX_BYTES` 50 MB → dừng: chống "bom nén") → **`parseBackup` y như cũ** (mọi lớp kiểm của B1 giữ
  nguyên). `format: 1` (file cũ) vẫn khôi phục được.
- Đổi mật khẩu sao lưu = giải khóa bí mật bằng mật khẩu cũ, mã hóa lại bằng mật khẩu mới (cặp khóa giữ nguyên → file cũ
  vẫn mở bằng **mật khẩu cũ** — ghi rõ). Quên mật khẩu = **file mã hóa không mở được** — cảnh báo đỏ khi bật.

**Code:** mới `src/utils/backupCrypto.ts` (thuần, test được bằng WebCrypto của Node ≥ 20); sửa `utils/backupFile.ts`
(`serializeBackup` / `parseBackup` nhận format 2), `services/backupFile.service.ts` (`backupNow`, `maybeAutoBackup`,
`applyRestore`), `components/backup/BackupSettingsSection.vue` (công tắc + đặt / đổi mật khẩu),
`components/backup/BackupRestoreDialog.vue` (ô mật khẩu).

**❓ Sir chốt:** khi bật lần đầu, có **nhắc bật mã hóa** không (đề xuất: có, một lần), hay để tắt hoàn toàn mặc định?

**Test `specs/S3-backup-encrypt.test.mjs`:** mã hóa → giải mã ra đúng; mật khẩu sai → lỗi rõ, **không ghi gì**; sửa 1 byte
`ct` → GCM từ chối; bom nén (1 KB → 200 MB) → từ chối; `alg` lạ / `iterations` ngoài 100.000–5.000.000 / base64 sai độ dài
→ từ chối; file `format: 1` vẫn chạy; tự sao lưu khi bật mã hóa **không cần** mật khẩu; khóa bí mật không bao giờ nằm
dạng thô trong kho; file không chứa chữ thường nào của ghi chú (grep tiêu đề mẫu trong file). **Công:** M.

**Không bảo vệ được (ghi trong README):** kho `chrome.storage.local` vẫn chữ thường khi máy đang chạy mã độc — dữ liệu
nhạy cảm nên để **thư mục bảo mật** (khóa chỉ ở RAM). Mã hóa toàn kho (SEC-3c) = công L, để sau.

---

## 7. Để sau / không làm bây giờ

| Mục | Vì sao để sau |
|---|---|
| SEC-3c mã hóa toàn kho máy bằng mật khẩu khi mở app | Công L, đổi định dạng lưu + đồng bộ + chuyển dữ liệu cũ; chỉ đáng khi có yêu cầu thật |
| vite 8 / `@crxjs/vite-plugin` 3 | Bản lớn, không có lỗ hổng sau T2; để Dependabot báo |
| Link trong ghi chú (Tiptap `link`) | Chức năng mới; nếu làm: danh sách trắng `https:` / `mailto:`, `rel="noopener noreferrer"`, mở bằng `chrome.tabs.create` |
| Mã hóa tài khoản (S3b, đang ẩn) | Thuộc `ROADMAP-S` |

---

## 8. Checklist chung cho mọi bản (copy)

```bash
for f in specs/*.test.mjs; do node "$f" >/dev/null 2>&1 || echo FAIL $f; done
```
```bash
npx vue-tsc --noEmit -p tsconfig.app.json
```
```bash
npm audit --omit=dev
```
```bash
cp -n .env.example .env; npm run build
```

Rồi PoC hồi quy bảo mật (phải in "✅ Không thấy dấu hiệu khai thác"):

```bash
node .claude/skills/redteam-hacker/references/poc-browser.mjs --extension dist --seed specs/redteam/seed.json --scenario specs/redteam/bbqone-scenario.mjs --out /tmp/bbqone-poc
```

+ kiểm tay 3 tab, Cài đặt, khôi phục file (0 lỗi console); nâng phiên bản (`package.json` → `npm run sync-version`; `DESIGN.md`; README What changed; Store
Release + WHAT'S NEW; permissions doc); commit; `git push origin HEAD:main`; Sir build bằng `.env` thật + upload. Sau mỗi
bản lớn: chạy `/redteam-hacker` một lượt để tìm lỗ mới.

---

## 9. Prompt mẫu (dán vào phiên mới — đã giới hạn phạm vi để tiết kiệm)

**2.1.2:**
```
Đọc specs/ROADMAP-SEC.md mục 1, 3 và 8 — chỉ đọc thêm các file được nêu trong đó. Làm T1 → T2 → T3 theo đúng các
bước đã chạy thử, trên main. Mỗi mục: spec + failing test (commit docs) → code (commit feat) → checklist mục 8.
Cuối cùng nâng 2.1.2 theo mục "Phát hành 2.1.2", push, báo kết quả ngắn bằng tiếng Việt.
```

**2.2.0** (sau khi Sir chốt mặc định S12):
```
Đọc specs/ROADMAP-SEC.md mục 1, 4 và 8. Sir chốt S12 mặc định = <Chỉ tên | Tên + đoạn trích>. Làm S11 → S12 → S9
trên main theo quy trình spec → RED → GREEN; S9 làm phần "chốt salt" trước phần nâng số vòng. Nâng 2.2.0, push.
```

**2.3.0** (sau A3 + Sir chốt tùy chọn / bắt buộc):
```
Đọc specs/ROADMAP-SEC.md mục 1, 5 và 8. 2FA = <tùy chọn | bắt buộc>. Làm S2 trên main; viết migration 019 nhưng
KHÔNG tự chạy trên Supabase — đưa lệnh cho Sir chạy. Sau khi xong chạy /redteam-hacker giới hạn ở luồng đăng nhập.
```

**2.4.0:**
```
Đọc specs/ROADMAP-SEC.md mục 1, 6 và 8 + specs/B1-backup-file.spec.md. Làm S3 trên main; giữ nguyên mọi lớp kiểm
của parseBackup. Nâng 2.4.0, push.
```

**Rà soát bảo mật định kỳ:** `/redteam-hacker` (skill trong `.claude/skills/redteam-hacker/`, hồ sơ BBQOne ở
`specs/REDTEAM-PROFILE.md`). Skill dùng được cho **mọi dự án khác**: `bash .claude/skills/redteam-hacker/scripts/install-global.sh`
(cài vào `~/.claude/skills/`) — xem `README.md` trong thư mục skill.

## Trạng thái

| Mục | Commit | Test | Ghi chú |
|---|---|---|---|
| Plan | `df9b000` | — | Chạy thử T1 (Tiptap 3.32.1) + T2 (vite 6.4.5) trên bản sao: audit 0, build OK, Chromium OK — chưa áp vào `main` |
| T1 + T2 | `1f3a8bc` docs → `7153340` feat | T1 6/6 | Tiptap 3.32.1 + vite 6.4.5: `npm audit` 0; schema y 2.x; Chromium so 2.x vs 3.x (mở không tự lưu, gõ / Ctrl+B / danh sách / khối code / hoàn tác / dán code) giống hệt; bundle +93 KB. Kèm `aaf064b`: harness P2 import qua `file://` (chạy được trên Windows) |
| T3 + 2.1.2 | `31955ab` docs → `eda7bda` feat | T3 8/8 | `.github/workflows/ci.yml` (`checkout@v7` / `setup-node@v7`, node 24) + `dependabot.yml`; chạy lại đúng các bước CI trên máy: audit 0 / 0, build OK, 87/87 harness, PoC ✅. SEC1.14–16 đổi có chủ đích (phiên bản hiện tại ≥ 2.1.1). **Chưa chạy trên GitHub** — xem tab Actions sau lần push đầu |
| T1.7 | `bffe86b` docs → `2d0ccee` fix | T1 7/7 | Dependabot PR #4 (supabase-js 2.118) gãy `vue-tsc -b`: `@types/node` chỉ có nhờ cài kèm → khai thẳng `^24`; SEC1.1 nhận `ws` không còn trong lock. Sau đó Sir merge PR #3 / #4 / #5 / #6 (shiki 4, pinia 4), đóng #2 (TypeScript 7 / vite 8 — để sau); bản gộp audit 0, 87/87, PoC ✅ |
| S11 | `57bd0de` docs → `8bf2e06` feat | S11 8/8 | Xóa tất cả bookmark: sao lưu `before-delete_…` trước (lỗi → không xóa), gõ XOA / DELETE, báo số đã xóa. Chromium: 3 → 0 → khôi phục đủ 3 |
| S12 | `919322c` docs → `d4d454d` feat | S12 9/9 | Sir chốt mặc định **Tên + đoạn trích**; Chỉ tên (bỏ thư mục + đoạn trích) / Tắt (không gợi ý, Enter không mang chữ đã gõ) |
| N6.1 | `a5aad10` docs → `2edadf9` fix | N6.1 4/4 | Sir thấy cảnh báo "lock option is deprecated" (supabase-js 2.118) → bỏ `lock`, auth-js ≥ 2.107 tự điều phối; Chromium: cảnh báo 1 → 0 |
| S9 | `6565ac7` docs → `b15365d` feat | S9 18/18 | Chốt salt (máy / tab khác đổi mật khẩu → khóa lại, báo), 600.000 vòng, nâng cấp giữ mật khẩu, ≥ 10 ký tự + chặn phổ biến. **Vá lỗi có sẵn:** đổi mật khẩu khi thư mục đang mở luôn báo sai mật khẩu. Chromium 2 tab đạt |
| R6 + 2.2.0 | `536e4eb` docs → (commit này) | R6 5/5 | T3.6–T3.8 đổi có chủ đích (≥ 2.1.2). **Kiểm tay 2.2.0 (Sir):** (1) đăng nhập, để quá 1 giờ, mở / đóng popup → vẫn đăng nhập, chrome://extensions › Errors không còn cảnh báo lock; (2) Bookmark › 🗑 → gõ XOA → xóa → khôi phục bản before-delete; (3) Cài đặt › Tìm từ thanh địa chỉ → Chỉ tên → gõ `bbq` thử; (4) thư mục bảo mật cũ → Nâng cấp; (5) **chỉ nâng cấp / đổi mật khẩu thư mục khi mọi máy đã lên 2.2.0** |
| Skill | `df9b000` | PoC ✅ | `.claude/skills/redteam-hacker/` dùng cho mọi dự án (recon tự nhận stack, 12 nhóm chung + 5 module stack, PoC trình duyệt web / extension). Thử: BBQOne → 0 dấu hiệu khai thác; trang web cố ý có lỗ → bắt được alert + request ra ngoài (thoát mã 1); dự án Express mẫu có lỗ → recon chỉ ra khóa AWS, `exec`, SQL ghép chuỗi, SSRF, CORS, mass assignment, Docker root. Hồ sơ BBQOne: `specs/REDTEAM-PROFILE.md` + `specs/redteam/` |
