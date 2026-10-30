# S9 — Thư mục bảo mật: chốt salt nhiều máy + PBKDF2 600.000 vòng + nâng cấp + độ mạnh mật khẩu (SEC-9, 2.2.0)

> **Failing test:** `specs/S9-pbkdf2-600k.test.mjs` (store thật + WebCrypto thật, mô phỏng 2 máy).
> **Nguồn:** `specs/ROADMAP-SEC.md` mục 4 (S9) — "chốt salt" làm **trước** phần nâng số vòng.

## Lỗi phải vá trước (tìm ra khi lập plan)

Khóa thư mục dẫn **thẳng** từ mật khẩu + `secure_salt` (không có DEK bọc). Máy A đổi mật khẩu → salt mới, mọi ghi chú mã hóa
lại. Máy B đang mở khóa vẫn giữ **khóa cũ** trong RAM (`stores/secureFolder.ts` `sessionKeys`), không chỗ nào so salt khi
đồng bộ về → B sửa ghi chú = **mã hóa bằng khóa cũ** → với mật khẩu mới **không mở được nữa** (mất dữ liệu). Giải mã bản
mới của A bằng khóa cũ cũng ném lỗi trong `decryptLoadedSecureRows` (test S9.4b đỏ: "The operation failed…").

## Lỗi có sẵn tìm ra khi kiểm trên Chromium (2026-10-30)

`changePassphrase` giải mã `notes.notes` trong RAM để kiểm mật khẩu cũ + lấy bản rõ — nhưng từ S1, thư mục **đang mở**
giữ **bản rõ** trong RAM (`decryptLoadedSecureRows` giải mã đè) → `decryptField(bản rõ)` ném lỗi → **"Đổi mật khẩu thư mục"
khi thư mục đang mở (có ghi chú) luôn báo "Current passphrase is wrong"**; chỉ chạy được khi đang khóa. Nâng cấp (PHẦN B)
chạy đúng đường đó nên phải vá cùng.

## PHẦN A — Chốt salt (`src/stores/secureFolder.ts`)

- Lưu salt đã dùng để dẫn khóa: `setKey(folderId, key, saltB64)` (`keySalts`); `deleteKey` xóa cả salt.
- `keyMatchesFolder(id)`: thư mục còn `is_secure` và `secure_salt === keySalts.get(id)`.
- `getKey(id)`: lệch → trả `null` **ngay** (thuần, không đổi state) → mọi đường ghi (`notes.ts` createNote / updateNote /
  updateBody / addBody, `sync.service` push, `secureCache` seal) đã có sẵn nhánh `'Folder locked'` / bỏ qua → không ghi
  bằng khóa sai. `isFolderLocked` dùng cùng phép kiểm. `decryptLoadedSecureRows` bỏ qua thư mục lệch salt.
- `watch` danh sách `id:secure_salt` của folders store: khóa đang giữ mà lệch → `deleteKey` + `saltChangedIds.add(id)` +
  `notes.loadAll()` (như khóa tay — xóa bản rõ khỏi RAM). Thư mục không còn → chỉ `deleteKey`.
- **Ngữ cảnh khác** (tab khác cùng máy, popup, SW đồng bộ về) không tự nạp lại danh sách thư mục ở ngữ cảnh này → nghe
  `chrome.storage.onChanged` trên `FOLDERS_CACHE_KEY` + `LOCAL_STORAGE_KEYS.folders`: thư mục đang giữ khóa mà salt mới
  khác → `useFoldersStore().loadAll()` (watcher ở trên làm phần còn lại). Khớp → không làm gì (ghi của chính mình).
- **Không tự khóa nhầm khi chính ngữ cảnh này đổi khóa**: `foldersService.update` (local-first) ghi kho → ngữ cảnh này nhận
  `onChanged` **trước** `setKey` → listener tưởng máy khác đổi → `folders.loadAll()` nạp `folders_cache` (salt cũ) trước →
  watcher khóa nhầm (thấy trên Chromium: nâng cấp xong thư mục tự khóa). → `rekeying` (Set): `rekeyFolder` đánh dấu thư
  mục trong lúc chạy (try / finally); listener + watcher bỏ qua thư mục đang đổi khóa.
- Mở khóa lại thành công → bỏ khỏi `saltChangedIds`. Hộp mở khóa hiện `secureFolder.saltChanged` khi thư mục nằm trong đó.
- Tự đổi mật khẩu / bật bảo mật / nâng cấp trên **máy này**: `setKey(…, newSalt)` **trước** khi gán thư mục mới vào
  folders store (không `await` ở giữa) → watcher thấy khớp, không báo nhầm.

## PHẦN B — 600.000 vòng + nâng cấp

- `utils/secureCrypto.ts`: `DEFAULT_PBKDF2_ITERATIONS = 600_000` (OWASP 2023, PBKDF2-HMAC-SHA256). Thư mục cũ mở bằng số
  vòng của chính nó (`pbkdf2_iterations` trên dòng thư mục — tương thích ngược sẵn).
- Tách lõi đổi khóa thành `rekeyFolder(folderId, oldPw, newPw)`:
  - **Kiểm mật khẩu cũ**: có verifier → giải verifier; không verifier mà đang mở → **so khóa** (mã hóa thử bằng khóa dẫn ra,
    giải bằng khóa phiên — không trích khóa); đang khóa → giải ghi chú đầu (RAM là bản mã). Sai → lỗi, chưa ghi gì.
  - **Bản rõ** từng trường: RAM là bản mã → giải bằng khóa cũ; RAM là bản rõ (đang mở) → dùng luôn.
  - Ghi từng ghi chú (bản mã khóa mới) → **gán lại RAM = bản rõ + dòng máy chủ trả về** (`updated_at` mới cho khóa lạc
    quan C9) → ghi thư mục salt mới + `DEFAULT` vòng + verifier mới → `setKey` khóa mới → `notes.persistCache()` (cache trên
    đĩa niêm phong lại bằng khóa mới — seal memo theo `CryptoKey` nên không dùng lại bản mã cũ) → `notes.loadAll()`. `changePassphrase` = kiểm độ mạnh mật khẩu mới + khớp xác nhận → `rekeyFolder`.
- `upgradeIterations(folderId, password)` = `rekeyFolder(folderId, password, password)` — **giữ mật khẩu cũ** (không áp
  độ mạnh mới: người dùng chỉ nâng số vòng). Chỉ chạy khi người dùng bấm (không tự động: chốt salt phải có trên mọi máy
  trước). Sai mật khẩu → lỗi, không ghi gì.
- `NoteList.vue`: thư mục đang chọn là bảo mật, **đang mở**, `pbkdf2_iterations < DEFAULT_PBKDF2_ITERATIONS` → dải nhỏ
  `secureFolder.upgradeHint` + nút `secureFolder.upgradeBtn` → `SecureFolderModal mode="upgrade"` (hỏi lại mật khẩu,
  không giữ mật khẩu trong RAM).

## PHẦN C — Độ mạnh mật khẩu (`src/utils/passwordStrength.ts`, không thêm thư viện)

`SECURE_FOLDER_MIN_PASSWORD = 10`; `secureFolderPasswordIssue(pw)`: `< 10` ký tự → `'tooShort'`; chuẩn hóa (chữ thường,
bỏ dấu, bỏ ký tự không phải chữ / số) rồi: nằm trong ~100 mật khẩu phổ biến (`password`, `123456789`, `qwerty`,
`iloveyou`, `matkhau`, `abc123456`…, kể cả khi thêm số / ký tự ở cuối như `Password123!`), một ký tự lặp, dãy số tăng /
giảm, 8 chữ số dạng ngày sinh `ddmmyyyy` (+ tối đa 2 số) → `'common'`; còn lại `null`. Áp cho **tạo** + **đổi** (không áp
khi mở khóa / nâng cấp). Lỗi = `t('secureFolder.err.tooShort' | 'secureFolder.err.common')`.

## PHẦN D — Giao diện (`SecureFolderModal.vue`)

- `mode` thêm `'upgrade'` (tiêu đề `secureFolder.titleUpgrade`, mô tả `secureFolder.upgradeDesc`, một ô mật khẩu →
  `secure.upgradeIterations(props.folderId, password.value)`).
- Mở khóa: `secure.saltChangedIds.has(folderId)` → dòng `secureFolder.saltChanged`.
- Tạo / đổi: dòng gợi ý `secureFolder.strengthHint`.
- Nút OK khi đang chạy → `secureFolder.unlocking` ("Đang xử lý…" — 600.000 vòng ~0,3–0,8 s).

## PHẦN E — Test

| Ca | Kiểm |
|---|---|
| S9.1 | `DEFAULT_PBKDF2_ITERATIONS === 600_000` |
| S9.2 | Thư mục 310.000 vòng mở được (chốt chặn) |
| S9.3a / b | Bật bảo mật / đổi mật khẩu ghi 600.000; khóa mới dùng được ngay, không báo nhầm đổi ở máy khác |
| S9.4e | Kho thư mục đổi ở ngữ cảnh khác: salt lệch khóa đang giữ → nạp lại thư mục 1 lần; khớp → không |
| S9.4a–d | 2 máy: salt mới về → `getKey` null ngay, thư mục hiện đã khóa; `decryptLoadedSecureRows` không lỗi; sau watcher: khóa bị quên, đánh dấu, `loadAll`; mở lại bằng mật khẩu mới → dùng được, bỏ đánh dấu |
| S9.5 | Đổi khi **đang mở** (RAM bản rõ): mật khẩu cũ sai → lỗi, 0 ghi; đúng → bản lên máy chủ mở được bằng mật khẩu mới, RAM vẫn bản rõ, cache ghi lại |
| S9.5c | Thư mục cũ **không verifier**, đang mở: cũ sai → lỗi, 0 ghi (so khóa); đúng → đổi được |
| S9.6 | `upgradeIterations`: sai → lỗi, 0 ghi; đúng mật khẩu cũ 8 ký tự → 600.000 + salt mới |
| S9.7a / b | 14 ca độ mạnh; tạo / đổi bằng mật khẩu yếu → lỗi i18n, 0 ghi |
| S9.8–S9.10 | Hộp thoại, dải nâng cấp, i18n |
| S9.11 | B1 `PBKDF2_MAX ≥ 600.000` (chốt chặn) |

## KHÔNG được đổi

Định dạng envelope (`retronote:1:`), verifier, `forgetFolderKey` / `lockFolder` / `lockAll`, mã hóa tài khoản (S2C1), số
vòng của thư mục cũ khi chỉ mở khóa.

## FLAG liên đới (rủi ro còn lại)

- Máy B **chưa đồng bộ về** salt mới mà đã sửa ghi chú: `updateNote` / `updateBody` đi qua khóa lạc quan C9 — A đã mã hóa
  lại mọi dòng (`updated_at` đổi) → ghi của B bị từ chối là xung đột (C9.2 hiện ra). Ghi chú **tạo mới** trên B trong
  khoảng đó vẫn mã hóa bằng khóa cũ → chỉ mở được bằng mật khẩu cũ. Muốn đóng hẳn: máy chủ so salt khi ghi (để sau).
- Sửa offline chưa đẩy trong thư mục đó trên B lúc khóa bị quên: như khóa tay hiện nay (`secureCache` không ghi bản rõ ra đĩa).
- `rekeyFolder` mã hóa lại từng ghi chú: đang chạy mà sửa ghi chú cùng thư mục trên chính máy này → hành vi như trước S9.

## Nghiệm thu

Harness PASS; Chromium: tạo thư mục bảo mật (mật khẩu yếu bị chặn, gợi ý hiện), thư mục 310.000 vòng hiện dải "mức bảo vệ
cũ" → Nâng cấp → mật khẩu cũ → dải biến mất, mở khóa lại vẫn được; 2 ngữ cảnh: A đổi mật khẩu → B bị khóa lại, hộp mở khóa
báo "đã đổi ở máy khác".
