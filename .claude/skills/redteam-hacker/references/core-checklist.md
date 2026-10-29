# Checklist chung — 12 nhóm, áp cho MỌI dự án

Mỗi nhóm: **câu hỏi kẻ tấn công** → **tìm ở đâu / lệnh** → **hay sai chỗ nào**. `scripts/recon.sh` đã gom phần lớn
grep; bảng dưới để đào sâu. Lệnh chạy từ gốc repo; thêm `--exclude-dir` nếu repo có thư mục build khác.

---

## 1. Cửa vào (nguồn không tin cậy)

Liệt kê **mọi** chỗ dữ liệu ngoài đi vào: HTTP route / GraphQL resolver / RPC, form, query / hash URL, header, cookie,
upload, import file (JSON / CSV / ZIP / ảnh), dán clipboard, webhook, message giữa ngữ cảnh (`postMessage`, message
extension, IPC Electron), dữ liệu đồng bộ từ server / cloud (tài khoản có thể đã bị chiếm), dữ liệu từ API bên thứ ba,
biến môi trường do người khác đặt, **đầu ra của LLM**.

Hỏi: dữ liệu có được **kiểm kiểu + độ dài + danh sách trắng** ngay tại cửa? Kiểm ở client thôi thì coi như không kiểm.

## 2. Điểm chìm (bẫy)

| Loại | Dấu hiệu |
|---|---|
| HTML / DOM (XSS) | `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `v-html`, `dangerouslySetInnerHTML`, `{@html}`, `bypassSecurityTrust*`, `|safe`, `mark_safe`, `raw(`, `html_safe`, `template.HTML(` |
| Thực thi mã | `eval`, `new Function`, `setTimeout("chuỗi")`, `vm.run*`, `child_process.exec*`, `spawn(…, {shell:true})`, `os.system`, `subprocess(…, shell=True)`, `exec.Command("sh", "-c", …)` |
| Truy vấn | SQL ghép chuỗi / template (`${}` / `+` / f-string / `%` / `Sprintf`), `.raw(`, `$queryRawUnsafe`, NoSQL `$where`, bộ lọc chuỗi PostgREST (`.or(\`…${x}\`)`), LDAP, XPath |
| Đường dẫn / file | `path.join(…, input)`, `open(input)`, `sendFile`, `res.download`, giải nén ZIP (zip-slip), tên file tải về |
| Mạng (SSRF) | `fetch` / `axios` / `requests` / `http.Get` với URL từ người dùng; webhook URL tùy ý; trình tạo ảnh xem trước link |
| Chuyển hướng | `redirect(input)`, `location = input`, `window.open(input)`, `tabs.create({url: input})` |
| Giải tuần tự | `pickle.loads`, `yaml.load` (không SafeLoader), `unserialize`, `Marshal.load`, `ObjectInputStream`, `JSON.parse` + merge đệ quy |
| Xuất file | HTML / CSV (công thức `=cmd` trong Excel) / ICS / XML / Markdown dựng bằng ghép chuỗi |

Hỏi: escape **đúng ngữ cảnh** chưa (text HTML ≠ thuộc tính ≠ URL ≠ JS ≠ CSS ≠ SQL ≠ shell ≠ ICS / CSV)? URL có
**danh sách trắng scheme** (`javascript:`, `data:`, `vbscript:`, `file:`)? Phân tích HTML có trên **tài liệu trơ** (không
tải ảnh / chạy gì)?

## 3. Xác thực (authN) & phiên

- Mật khẩu: độ dài tối thiểu, chặn mật khẩu đã lộ, băm bằng `bcrypt` / `argon2` / `scrypt` (không `md5` / `sha1` /
  `sha256` trơn), giới hạn đăng nhập sai, khóa / captcha phù hợp nền tảng.
- 2FA có không; nếu có, **máy chủ có bắt buộc** (không chỉ màn hình)? Luồng đổi mật khẩu / email / khôi phục có bỏ qua
  2FA không?
- Token: ký + kiểm hạn đúng (`jwt.verify`, không `decode`), chặn `alg: none`, khóa ký đủ mạnh; refresh token xoay vòng;
  đăng xuất hủy phía server?
- Cookie: `HttpOnly`, `Secure`, `SameSite`; token để `localStorage` → XSS là mất phiên.
- Quên mật khẩu: token ngẫu nhiên đủ dài, hết hạn, dùng một lần; không lộ "email có tồn tại không".

## 4. Phân quyền (authZ) — nơi lỗ nặng nhất hay nằm

- **IDOR:** đổi `id` trong URL / body có đọc / sửa được của người khác? Mọi truy vấn có lọc theo chủ sở hữu **phía
  server**?
- Leo quyền: trường `role` / `is_admin` / `plan` gửi từ client có được nhận (mass assignment)?
- Đa tenant: mọi bảng / bucket / cache key có tenant id?
- BaaS: RLS / security rules cho **từng** bảng / collection / bucket (xem `stacks/baas-supabase-firebase.md`).
- Hàm chạy quyền cao (`SECURITY DEFINER`, Cloud Function admin SDK, service role) có tự kiểm người gọi?

## 5. Bí mật & cấu hình

- Khóa trong repo / lịch sử git / bundle client (`service_role`, AWS, khóa riêng, token GitHub / Slack / OpenAI…).
  Phân biệt khóa **công khai theo thiết kế** (Supabase anon, Firebase web API key) với khóa bí mật.
- `.env` bị git theo dõi? File mẫu có giá trị thật?
- Chế độ debug / stack trace / trang lỗi chi tiết bật ở production? Endpoint admin / health lộ thông tin?
- CORS `*` kèm credentials; thiếu header (`CSP`, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`).

## 6. Mật mã

- PBKDF2-SHA256 ≥ 600.000 vòng (OWASP 2023) / argon2id; salt ≥ 16 byte ngẫu nhiên; AES-GCM IV 12 byte **mới mỗi lần**.
- `Math.random` / `rand()` cho token, mã mời, OTP → dự đoán được.
- Tự chế mật mã, ECB, IV cố định, `createCipher` (không `iv`), so sánh chữ ký không hằng thời gian.
- Tắt kiểm chứng chỉ: `rejectUnauthorized: false`, `verify=False`, `InsecureSkipVerify: true`.
- Khóa sống ở đâu, bao lâu; đổi mật khẩu / xoay khóa thì dữ liệu & thiết bị khác xử lý ra sao (khóa cũ còn ghi được?).
- Parse ciphertext có **nghiêm** (chuỗi người dùng gõ giống ciphertext)? Có đường **hạ cấp** về chữ thường?

## 7. Riêng tư & rò rỉ

- Log in mật khẩu / token / nội dung người dùng / `req.body`? Thông báo lỗi trả dữ liệu nội bộ?
- Request ra ngoài khi mở app (font, CDN, analytics, ảnh trong nội dung) → lộ IP, theo dõi.
- Tìm kiếm / gợi ý / thông báo / tiêu đề tab lộ nội dung khi chia sẻ màn hình.
- File xuất / sao lưu chữ thường nằm ở thư mục đồng bộ cloud.

## 8. Chuỗi cung ứng

- Lỗ đã công bố: `npm audit --omit=dev` (production) vs `npm audit` (cả công cụ dev); `pip-audit`, `govulncheck`,
  `cargo audit`, `bundle audit`. **Phân biệt** gói chạy ở production với gói chỉ lúc build / dev server.
- Lockfile có + cài bằng `npm ci`; gói mới thêm gần đây đáng tin? (tải / tuần, người duy trì, tên gần giống gói nổi
  tiếng — typosquat); script `postinstall`.
- CI: có chạy audit / test? GitHub Actions: `pull_request_target` + checkout code PR (nguy hiểm), action không ghim
  (`@main`), `permissions` quá rộng, secret lộ trong log.
- Dependabot / Renovate có không.

## 9. Cạn tài nguyên / treo

- Giới hạn kích thước body / upload / import, số dòng, độ sâu JSON / cây, độ dài chuỗi.
- Regex chạy trên input (ReDoS); regex dựng từ input mà không escape.
- Phân trang có trần; truy vấn không giới hạn (`limit`), N+1.
- Tham số tốn CPU lấy từ dữ liệu ngoài (số vòng KDF, kích thước ảnh) có trần? Giải nén có trần (bom nén)?
- Hạn mức lưu trữ (quota) — ghi vượt có bị nuốt lỗi → mất dữ liệu im lặng?

## 10. Thao tác phá hủy & lừa người dùng

- Thao tác không hoàn tác được (xóa tất cả, ghi đè khi khôi phục, xóa tài khoản) chỉ cần một cú bấm? Có sao lưu tự động
  trước, gõ chữ xác nhận, hoàn tác?
- Link trong nội dung người dùng khác tạo: `target="_blank"` thiếu `rel="noopener noreferrer"`, link lừa đảo.
- Giả mạo giao diện: ký tự đảo chiều U+202E, chữ giống nhau (homoglyph), nội dung giả thông báo hệ thống.
- Clickjacking: trang nhạy cảm cho nhúng iframe (`frame-ancestors` / `X-Frame-Options`).

## 11. Tranh chấp & vòng đời

- Đọc–sửa–ghi không khóa / không phiên bản → ghi đè mất dữ liệu; TOCTOU (kiểm xong mới dùng).
- Thao tác tiền / hạn mức có thể gửi đồng thời nhiều lần (double spend, dùng mã giảm giá 2 lần).
- Trạng thái nhạy cảm (khóa, phiên, quyền đã cấp) sống lâu hơn mong muốn; job nền chạy với dữ liệu chưa kiểm.

## 12. Hạ tầng & triển khai (nếu repo có)

- Dockerfile chạy `root`, tag `latest`, copy cả `.env` / `.git` vào image.
- Bucket / storage công khai; database mở ra Internet; cổng admin lộ.
- Terraform / k8s: `privileged`, `hostNetwork`, secret trong manifest dạng chữ thường.
- Backup / log lưu ở đâu, ai đọc được.
