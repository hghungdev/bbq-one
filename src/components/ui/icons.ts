/**
 * U15: bộ icon DUY NHẤT của app — mọi icon hành động / điều hướng vẽ qua `AppIcon` từ đây.
 * Khung 24, nét (stroke) đầu tròn; mỗi icon là danh sách `d` của <path> (hình tròn / chữ nhật cũng viết
 * thành path để một cách vẽ dùng cho tất cả).
 *
 * Một icon — một nghĩa: trash = xóa, close = đóng / xóa chữ, plus = thêm, pencil = sửa / đổi tên,
 * move = chuyển, copy = sao chép, restore = khôi phục, download = xuất, refresh = tải lại,
 * upload-cloud = sao lưu, lock / unlock = khóa / mở khóa, user = tài khoản / đăng nhập, log-out = đăng xuất.
 */
export const APP_ICONS = {
  trash: [
    'M3 6h18',
    'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
    'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    'M10 11v6M14 11v6',
  ],
  close: ['M18 6 6 18M6 6l12 12'],
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  pencil: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z'],
  move: ['M3 7h11M3 12h18M3 17h11', 'M17 4l4 3-4 3M17 14l4 3-4 3'],
  copy: [
    'M11 9h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z',
    'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  ],
  restore: ['M9 14 4 9l5-5', 'M4 9h11a5 5 0 0 1 0 10h-3'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  refresh: [
    'M3 12a9 9 0 0 1 15.36-6.36L21 8',
    'M21 3v5h-5',
    'M21 12a9 9 0 0 1-15.36 6.36L3 16',
    'M3 21v-5h5',
  ],
  'upload-cloud': [
    'M16 16l-4-4-4 4',
    'M12 12v9',
    'M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3',
  ],
  lock: [
    'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z',
    'M7 11V7a5 5 0 0 1 10 0v4',
  ],
  unlock: [
    'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z',
    'M7 11V7a5 5 0 0 1 9.9-1',
  ],
  key: ['M13 15.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z', 'M11.4 11.6 21 2', 'M16 7l3 3', 'M19 4l2 2'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z'],
  check: ['M20 6 9 17l-5-5'],
  alert: [
    'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z',
    'M12 9v4',
    'M12 17h.01',
  ],
  search: ['M17.5 11a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z', 'M16 16l4.5 4.5'],
  settings: [
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
  ],
  user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'],
  'log-out': ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  link: [
    'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
    'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  ],
  'chevron-left': ['M15 6l-6 6 6 6'],
  'chevron-right': ['M9 6l6 6-6 6'],
  'chevron-down': ['M6 9l6 6 6-6'],
} satisfies Record<string, string[]>

export type AppIconName = keyof typeof APP_ICONS
