// Kịch bản PoC hồi quy của BBQOne cho skill redteam-hacker (references/poc-browser.mjs).
// Chạy (sau `npm run build`):
//   node .claude/skills/redteam-hacker/references/poc-browser.mjs --extension dist \
//     --seed specs/redteam/seed.json --scenario specs/redteam/bbqone-scenario.mjs --out <thư mục tạm>
// seed.json = dữ liệu độc giả "đồng bộ từ tài khoản bị chiếm" (ảnh theo dõi, onerror, javascript:, data:) — chỉ evil.example.
export default async function scenario(page, h) {
  await page.waitForSelector('.cal-grid')
  const fontOk = await page.evaluate(() => document.fonts.check('16px Inter'))
  h.log('Lịch: font Inter đóng gói', fontOk)

  // Ghi chú: mở ghi chú độc, kiểm Shiki dưới CSP, tìm kiếm (plainTextFromHtml trên tài liệu trơ)
  await page.locator('.shell__rail-item').nth(1).click()
  await h.wait(500)
  await page.locator('.note-item').first().click()
  await h.wait(1500)
  h.log('Shiki tô màu (span):', await page.evaluate(() => document.querySelectorAll('.retro-shiki span[style*="color"]').length))
  h.log('Trình soạn có <img>/<a href=javascript>?', await page.evaluate(() =>
    !!document.querySelector('.note-editor__prose img, .note-editor__prose a[href^="javascript"]')))
  await page.locator('#bbqone-notes-search').fill('tracking')
  await h.wait(600)
  await page.locator('#bbqone-notes-search').fill('')
  await h.wait(300)

  // Dán HTML độc vào trình soạn
  await page.locator('.note-item').first().click()
  await h.wait(400)
  await h.paste('.note-editor__prose', '<p>pasted <img src="https://evil.example/paste.png"></p><iframe src="https://evil.example/frame"></iframe>')
  await h.wait(600)
  h.log('Sau khi dán có <img>/<iframe>?', await page.evaluate(() => !!document.querySelector('.note-editor__prose img, .note-editor__prose iframe')))
  await h.shot('bbqone-notes')

  // Bookmark: khôi phục bản sao lưu có javascript: / data:
  await page.locator('.shell__rail-item').nth(2).click()
  await h.wait(800)
  await page.locator('.bm-tab__backup-item').first().hover()
  await page.locator('.bm-tab__backup-item button[aria-label*="Khôi phục"]').first().click()
  await h.wait(300)
  h.log('Hộp xác nhận:', (await page.locator('.retro-confirm').innerText()).replace(/\s+/g, ' '))
  await page.locator('.retro-confirm__confirm-btn').click()
  await h.wait(1200)
  const urls = await page.evaluate(async () => {
    const out = []
    const walk = (ns) => ns.forEach((n) => { if (n.url) out.push(n.url); if (n.children) walk(n.children) })
    walk(await chrome.bookmarks.getTree())
    return out
  })
  h.log('Cây Chrome sau khôi phục:', JSON.stringify(urls), urls.some((u) => !/^https?:/i.test(u)) ? '❌ còn link lạ' : '✅ chỉ http(s)')
  await h.shot('bbqone-bookmarks')
}
