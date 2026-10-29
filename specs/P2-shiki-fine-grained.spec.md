# P2 — Shiki gọn: chỉ nạp 10 ngôn ngữ + 2 theme đang dùng

> **Failing test:** `specs/P2-shiki-fine-grained.test.mjs`. Kế hoạch: `specs/ROADMAP-P.md`.

## Hiện trạng

`src/utils/highlight.ts:35` `await import('shiki')` = bundle đầy đủ → Vite tách **mọi** ngôn ngữ (~200) và theme
(~60) thành chunk riêng: `dist/` **11 MB / 295 file** (vd `emacs-lisp` 805 KB, `cpp` 698 KB, `wolfram` 269 KB),
trong khi `LANGS` chỉ có 10 ngôn ngữ (`javascript typescript sql php bash python json html css markdown`) và 2
theme (`github-light`, `github-dark`). Gói upload Store, cài đặt, cập nhật đều mang ~10 MB không bao giờ chạy.
Kèm: hai lần gọi đồng thời trước khi highlighter tạo xong → tạo **hai** highlighter (biến chỉ gán sau `await`).

## Sửa — `src/utils/highlight.ts`

- `createHighlighterCore` (`shiki/core`) + `createOnigurumaEngine(import('shiki/wasm'))`
  (`shiki/engine/oniguruma`) — **cùng engine WASM như cũ** → HTML tô màu giống hệt từng byte.
- Ngôn ngữ / theme import riêng từng file: `shiki/langs/<lang>.mjs`, `shiki/themes/github-{light,dark}.mjs`
  (ngôn ngữ nhúng như html → css/javascript, php → sql/json/xml/java… tự kéo theo).
- Giữ API `highlightCode(code, lang)`, giữ quy tắc: ngôn ngữ lạ → `markdown`; lỗi khi tô → thử lại `markdown`; theme
  theo `document.documentElement.dataset.theme`.
- Highlighter giữ dạng **Promise** dùng chung (hết tạo trùng khi nhiều code block mở cùng lúc).
- Không còn `import … from 'shiki'` ở dạng giá trị (chỉ `import type` được phép).

## KHÔNG được đổi

`CodeBlock.vue`, CSS `.shiki`, CSP (`'wasm-unsafe-eval'` vẫn cần — engine WASM giữ nguyên), danh sách ngôn ngữ.

## Nghiệm thu

Test GREEN (HTML từ highlighter mới === HTML từ bundle đầy đủ cho 10 ngôn ngữ × 2 theme + ngôn ngữ lạ); mọi harness
khác PASS; `vue-tsc` sạch; build OK; `dist/` từ 11 MB / 295 file xuống ~3 MB / < 60 file (font P1 + WASM giữ lại); code block trong ghi
chú vẫn tô màu (light + dark).
