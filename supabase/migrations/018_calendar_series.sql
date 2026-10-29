-- F3: chuỗi sự kiện lặp — các lần lặp tạo cùng lúc (U3) có chung series_id; NULL = sự kiện đơn / tạo trước bản này.
-- Chạy trong Supabase SQL Editor TRƯỚC khi phát hành bản có F3: đồng bộ đẩy sự kiện bằng upsert mọi cột, bảng thiếu
-- cột thì đẩy lỗi. Cột cho phép NULL → bản cũ vẫn chạy bình thường sau khi chạy file này. RLS / RPC không đổi.

ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS series_id uuid NULL;

-- PostgREST nhận cột mới ngay (không phải chờ tự nạp lại schema cache).
NOTIFY pgrst, 'reload schema';
