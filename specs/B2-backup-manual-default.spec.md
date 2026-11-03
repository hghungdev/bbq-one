# B2 — Sao lưu ra file: mặc định chỉ bằng tay (tự động sao lưu TẮT, người dùng tự bật)

> **Failing test:** `specs/B2-backup-manual-default.test.mjs`. **Sir (2026-11-03):** "backup hiện tại mỗi ngày user mở
> extension lần đầu để tải file về, user không biết sẽ nghĩ là file virus — mình không nên tự động tải về, khi nào user
> cần backup thì vào setting bấm tải tốt hơn."

## Hiện tại (B1, 2.1.0–2.3.1)

- `readBackupState`: `autoEnabled: s.autoEnabled !== false` → **mặc định BẬT**.
- `writeBackupState(patch)` ghi `{ ...readBackupState(), ...patch }` → lần ghi trạng thái đầu tiên (kiểm hằng ngày, sao
  lưu tay…) **tự ghi `autoEnabled: true` vào kho**. Chỉ đổi mặc định thì máy đã cài vẫn còn bật.
- Mở popup lần đầu trong ngày (không đăng nhập, dữ liệu đổi) → Chrome tải `Downloads/BBQOne/bbqone-auto-<thứ>.json`
  không hỏi.

## Sửa

1. **`src/services/backupFile.service.ts`**: công tắc lưu ở field mới **`autoOptIn`** (chỉ `true` khi người dùng tự bật
   trong Cài đặt). `readBackupState().autoEnabled = s.autoOptIn === true` — bỏ qua `autoEnabled` cũ trong kho → **mọi máy
   về TẮT** (kể cả máy 2.1.0–2.3.1 đã tự ghi `true`). `writeBackupState` đổi `autoEnabled` của patch thành `autoOptIn`,
   không ghi lại field cũ. API (`BackupState.autoEnabled`, `BackupSettingsSection.vue`) giữ nguyên.
2. **Giữ nguyên**: "Sao lưu ngay" (tải khi bấm), "Khôi phục từ file" + bản an toàn trước khi thay (người dùng bấm, hộp
   xác nhận đã nói), công tắc tự động trong Cài đặt › Sao lưu (bật được — khi bật chạy như B1).
3. **i18n** `backup.autoDesc` (en / vi): nói rõ **mặc định tắt**, bật thì BBQOne tự lưu file vào Tải xuống không hỏi.
4. **Tài liệu**: README (bảng Features), mô tả Store (BACKUP FILES + dòng WHAT'S NEW), permissions doc (`downloads`),
   privacy policy (Backup files) — sao lưu khi bấm "Back up now"; tự động là tùy chọn, mặc định tắt.

## Test

| Ca | Kiểm |
|---|---|
| B2.1 | Kho trống → `autoEnabled` false; `maybeAutoBackup` → `'skipped'`, không tải file |
| B2.2 | Kho kiểu 2.1.0–2.3.1 (`autoEnabled: true` tự ghi) → `autoEnabled` false, các field khác giữ; không tải file |
| B2.3 | Bật tay (`writeBackupState({ autoEnabled: true })`) → kho có `autoOptIn: true`, không còn `autoEnabled`; tự sao lưu chạy (`'saved'`); ghi trạng thái khác vẫn giữ bật; tắt lại → `autoOptIn: false` |
| B2.4 | i18n `backup.autoDesc` en / vi: "Off by default" / "Mặc định tắt" |
| B2.5 | README + mô tả Store + permissions doc + privacy policy: mặc định tắt, hết "unless you turn it off" / "can be turned off" / tự động mỗi ngày như mặc định |

Đổi assertion có chủ đích ở B1: B1.17–B1.19 bật công tắc trước khi thử tự sao lưu; B1.20 mặc định TẮT.
