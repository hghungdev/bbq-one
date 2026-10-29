/**
 * SEC-8: bỏ ký tự điều khiển khỏi chữ đến từ nguồn ngoài (file sao lưu…) — chúng chèn được dòng / thuộc tính mới vào
 * định dạng theo dòng (iCalendar của link Google Calendar), làm hỏng XML gợi ý thanh địa chỉ…
 * - một dòng (tên, nhãn): mọi ký tự điều khiển (kể cả xuống dòng, tab) → khoảng trắng;
 * - nhiều dòng (mô tả): `\r\n` / `\r` → `\n`, giữ `\n` + tab, bỏ phần còn lại.
 */
export function stripControlChars(text: string, multiline = false): string {
  if (!multiline) return text.replace(/[\u0000-\u001f\u007f]/g, ' ')
  return text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
}
