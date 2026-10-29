# Module: Backend / API (Node Express-Fastify-Nest-Hono, Python Django-Flask-FastAPI, Go, Rails, PHP, Java…)

## Kiểm

1. **Bản đồ route**: liệt kê mọi route + middleware xác thực / phân quyền gắn vào. Route nào **thiếu** middleware
   (thường: route mới, route admin, route export / webhook / health / debug, phiên bản API cũ `/v1`)?
   ```bash
   grep -rnE "\.(get|post|put|patch|delete)\(['\"]/|@(Get|Post|Put|Patch|Delete)\(|@app\.(get|post|route)|path\(|HandleFunc\(" --include=*.{ts,js,py,go,rb,php,java} . | grep -v node_modules | head -60
   ```
2. **IDOR / phân quyền theo đối tượng**: mỗi truy vấn theo `id` có kèm `owner_id = currentUser` / tenant? Bulk
   endpoint, export, file download theo id, GraphQL resolver lồng nhau (lấy được đối tượng con của người khác).
3. **Mass assignment**: `Model.create(req.body)`, `update(req.body)`, serializer `fields = '__all__'` → client gửi
   `role`, `is_admin`, `owner_id`, `balance`.
4. **Injection**: SQL ghép chuỗi (`query(\`… ${x}\`)`, f-string, `Sprintf`, `.raw`, `$queryRawUnsafe`,
   `sequelize.query`), NoSQL (`$where`, object từ JSON đưa thẳng vào `find` → `{"$ne": null}`), command (`exec`,
   `shell=True`), template server (Jinja `render_template_string`, EJS với input), header injection (CRLF).
5. **SSRF**: tải URL từ người dùng (webhook, xem trước link, nhập ảnh từ URL) → chặn IP nội bộ (127.0.0.0/8,
   10/8, 172.16/12, 192.168/16, 169.254.169.254 metadata cloud, `::1`), chặn redirect sang nội bộ, DNS rebinding.
6. **File**: upload kiểm loại bằng nội dung (không chỉ đuôi / Content-Type), giới hạn cỡ, lưu ngoài web root, tên ngẫu
   nhiên; path traversal ở download; giải nén zip-slip; xử lý ảnh (ImageMagick / sharp) với file độc.
7. **Xác thực**: JWT (`verify` + `algorithms` cố định + hạn), so sánh mật khẩu / token hằng thời gian, rate limit
   đăng nhập / quên mật khẩu / OTP, khóa tài khoản, phiên cũ bị hủy khi đổi mật khẩu.
8. **CORS / CSRF**: `origin: true` / `*` + `credentials`; cookie phiên không `SameSite` + endpoint đổi trạng thái bằng
   GET / form → CSRF.
9. **Lỗi & log**: stack trace trả client; log in `req.body` (mật khẩu, token), log injection (xuống dòng).
10. **Giới hạn**: body size (`express.json({ limit })`), timeout, phân trang có trần, GraphQL độ sâu / độ phức tạp,
    ReDoS.
11. **Webhook đến**: kiểm chữ ký (HMAC) + chống phát lại (timestamp); không tin payload trước khi kiểm.
12. **Job / hàng đợi / cron**: dữ liệu trong hàng đợi coi là không tin cậy; quyền của worker.

## PoC

Chạy server **cục bộ** (lệnh trong hồ sơ dự án), dùng `curl` với 2 tài khoản thử (A, B): B gọi tài nguyên của A (IDOR),
gửi trường lạ (mass assignment), payload `payloads.md` (SQL / NoSQL / path / SSRF trỏ `http://127.0.0.1:<cổng khác>`).
Không bao giờ trỏ PoC vào production.
