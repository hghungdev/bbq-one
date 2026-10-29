# Mẫu báo cáo `REDTEAM-<YYYY-MM-DD>.md`

Nơi để: theo hồ sơ dự án; mặc định `security/REDTEAM-<YYYY-MM-DD>.md`. Viết cho người không chuyên đọc được: câu ngắn,
nói hậu quả bằng lời thường trước, thuật ngữ sau.

```markdown
# Rà soát bảo mật kiểu kẻ tấn công — <YYYY-MM-DD> (<tên dự án> <phiên bản / commit>)

> Yêu cầu: "<trích nguyên văn>". Phạm vi: <toàn bộ | luồng X | diff từ commit Y>. Chỉ rà soát + PoC cục bộ, chưa sửa gì
> — chờ duyệt.

## Cách kẻ tấn công nhìn <tên dự án>

<5–8 gạch đầu dòng: tài sản đáng giá, cửa vào, lớp phòng thủ chính, chỗ yếu nhất.>

## Bảng tóm tắt (ưu tiên từ trên xuống)

| # | Mức | Tình huống | Trạng thái | Công |
|---|---|---|---|---|
| SEC-<n> | **Cao** | <một câu: kẻ tấn công làm gì → hậu quả> | Mở | S |
| ✓ | — | Đã ổn: <liệt kê ngắn> | Đã kiểm | — |

(Đánh số tiếp từ báo cáo trước.)

## Chi tiết

### SEC-<n> (<Mức>) — <Tiêu đề>

- **Bằng chứng:** `<file>:<dòng>` — `<trích code / cấu hình>`.
- **Kịch bản:** <bước 1 → 2 → 3; điều kiện tiên quyết>.
- **Đang được đỡ bởi:** <lớp nào, đỡ được tới đâu>.
- **PoC:** <cách chạy + kết quả đo> (hoặc "giả thuyết, chưa xác minh").
- **Sửa:** <file, hàm, thay bằng gì>. Công <XS/S/M/L>.

## Đã kiểm — đang ổn

- <mục + bằng chứng ngắn>

## Chưa kiểm được (cần người dùng)

- <cấu hình dashboard cloud, GitHub settings, server production…>

## Đề xuất thứ tự

1. <gom các mục nhỏ, rủi ro thấp thành một bản vá>
2. <việc cấu hình người dùng tự làm ngay>
3. <mục lớn — kế hoạch riêng>
```

Khi được duyệt và vá xong: cột Trạng thái → `✅ <phiên bản> (<mã việc>)`; cập nhật bảng "Các lần rà soát" trong
`REDTEAM-PROFILE.md`.
